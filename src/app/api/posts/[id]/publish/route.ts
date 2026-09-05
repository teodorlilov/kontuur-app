import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse, after } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import {
  PUBLISHABLE_POST_COLUMNS,
  publishOnePublication,
  resumePendingPublication,
  type PublishablePost,
} from '@/features/publishing/lib/publish-post'
import { assignDestinations } from '@/features/publishing/lib/destinations'
import { fetchConnection } from '@/features/publishing/lib/connection'
import { resolveNetwork } from '@/lib/meta/networks'
import { statusForSlot } from '@/lib/posts/status-for-slot'
import type { PostType } from '@/types/api'

/**
 * Publish a post now. Thin over publishOnePublication — the cron scheduler runs the same
 * implementation, so the claim and the retry ladder cannot diverge between the two entry
 * points.
 *
 * Deferred by design: the response goes out as soon as the network has accepted the content
 * and its reference is persisted (~1–2s), and the wait continues after the response via
 * after(). The client watches the post's status for the outcome; the cron's resume arm is
 * the backstop if this invocation dies.
 */

// The after() continuation waits for up to ~40s past the response.
export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const ownership = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!ownership) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  try {
    const { data, error } = await admin
      .from('posts')
      .select(`${PUBLISHABLE_POST_COLUMNS}, scheduled_at`)
      .eq('id', postId)
      .maybeSingle()
    if (error) throw new Error(`post lookup failed: ${error.message}`)
    // WHY as: the joined post_images shape does not infer through the shared client.
    const post = data as unknown as (PublishablePost & { scheduled_at: string | null }) | null
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const postType = (post.post_type ?? 'single') as PostType
    // Publishing now is the moment destinations come into existence for a post that was never
    // scheduled — the same operation scheduling performs, so it goes through the same function.
    // Idempotent, so pressing the button twice cannot create duplicates.
    const publications = await assignDestinations(admin, postId, post.client_id, postType, 'all')
    if (publications.length === 0) {
      return NextResponse.json(
        { error: 'This client has no connected account that can take this post' },
        { status: 400 }
      )
    }
    const pending = publications.filter((p) => p.status !== 'published')
    if (pending.length === 0)
      return NextResponse.json({ error: 'Already published' }, { status: 400 })

    /**
     * Every destination at once.
     *
     * Each still resolves its OWN credentials — a client publishing to two networks must never
     * send one network's post with the other's token — and each claims its own publication row,
     * so nothing is shared but the admin client. Running them in sequence bought none of that
     * and cost the whole of one network's round trip: measured, Facebook takes ~7.5s to publish
     * while Instagram takes 26-43s, so whichever happened to go first delayed the other by its
     * entire duration. The person is waiting on the slowest network, not on their sum.
     *
     * `allSettled`, not `all`: one destination throwing must not discard the outcome of a
     * destination that already succeeded. A rejection here is a bug rather than a publish
     * failure — `publishOnePublication` reports those as outcomes — so it is logged and the
     * remaining destinations still answer.
     */
    const settled = await Promise.allSettled(
      pending.map(async (publication) => {
        const adapter = resolveNetwork(publication.platform)
        if (!adapter) return null
        const connection = await fetchConnection(admin, post.client_id, adapter.platform)
        const result = await publishOnePublication(admin, publication, post, connection, {
          skipPoll: true,
        })
        return { publication, adapter, outcome: result }
      })
    )

    const outcomes = settled.flatMap((entry) => {
      if (entry.status === 'rejected') {
        console.error(`[publish] destination threw for post ${postId}:`, entry.reason)
        return []
      }
      return entry.value ? [entry.value] : []
    })

    /**
     * One answer for the whole press, in the order a person cares about: anything still in
     * flight is the headline, then anything live, then the failure. Aggregating this way
     * means the button says "publishing…" while one destination is mid-send even if another
     * has already landed.
     */
    const first =
      outcomes.find((o) => o.outcome.kind === 'pending') ??
      outcomes.find((o) => o.outcome.kind === 'published') ??
      outcomes[0]
    if (!first) throw new Error(`no destination was attempted for post ${postId}`)
    const { adapter, outcome } = first

    /**
     * A never-scheduled post gets its slot stamped as soon as the publish is underway — the
     * cron's backstop window only sees rows with a scheduled_at.
     *
     * The status moves with it, through the same helper every other slot write uses. Stamping
     * the instant alone left `status: 'approved'` beside a non-null `scheduled_at`, and the
     * calendar splits its list on exactly that pair: the unscheduled tray takes
     * `approved && !scheduled_at` and the grid takes `scheduled && scheduled_at`. A post
     * publishing from the tray matched neither and disappeared from the calendar entirely,
     * while being live on Instagram.
     */
    const publishedNow = new Date().toISOString()
    if (!post.scheduled_at && (outcome.kind === 'published' || outcome.kind === 'pending')) {
      const { error: slotError } = await admin
        .from('posts')
        .update({ scheduled_at: publishedNow, status: statusForSlot(publishedNow) })
        .eq('id', postId)
      // The one write here whose failure was discarded. It matters most in the `pending` case:
      // without a slot the cron's backstop window cannot see the row, so a deferred publish
      // whose worker then dies has nothing left to finish it.
      if (slotError) console.error(`[publish] slot stamp failed for ${postId}:`, slotError.message)
    }

    // The networks this press reached. A post published from the unscheduled tray has no
    // publications in the browser's copy — they were created by this request — so the card has
    // nothing to mark as published without being told.
    const platforms = outcomes.map((o) => o.publication.platform)

    /**
     * EVERY destination still in flight is finished after the response, not just the one the
     * reply describes.
     *
     * Both adapters return `pending` under `skipPoll`, so a post going to two networks leaves
     * two publications mid-flight — and this resumed only `first`. The other waited for the
     * cron's resume arm, which needs a 90s claim grace on a five-minute tick, while the
     * browser stops watching after 60s: the second network reported "still processing" on
     * essentially every two-destination publish. Worse, when the pending one was not `first`
     * — a destination that published outright sorts ahead of it — nothing was scheduled at
     * all. For Facebook that means a post created with `published:false` and never flipped
     * live until the cron noticed.
     *
     * `resumePendingPublication` no-ops on a row that is not `publishing` with a reference, so
     * scheduling one per destination cannot double-publish.
     */
    for (const pending of outcomes) {
      if (pending.outcome.kind !== 'pending') continue
      const id = pending.publication.id
      after(() => resumePendingPublication(admin, id, 40_000))
    }

    switch (outcome.kind) {
      case 'published': {
        if (outcome.writeError) console.error(`[publish] ${outcome.writeError}`)
        return NextResponse.json({ ok: true, externalPostId: outcome.externalPostId, platforms })
      }
      case 'pending':
        // Scheduled above, for every destination. The client watches the post's status.
        return NextResponse.json(
          { ok: true, pending: true, message: `Publishing to ${adapter.label}…`, platforms },
          { status: 202 }
        )
      case 'not_claimed':
        return NextResponse.json({ error: 'Post is already being published' }, { status: 409 })
      case 'failed':
        if (outcome.writeError) console.error(`[publish] ${outcome.writeError}`)
        return NextResponse.json({ error: outcome.error }, { status: 500 })
    }
  } catch (err) {
    console.error('Publish error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
