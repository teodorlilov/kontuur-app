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
    const publications = await assignDestinations(admin, postId, post.client_id, postType)
    if (publications.length === 0) {
      return NextResponse.json(
        { error: 'This client has no connected account that can take this post' },
        { status: 400 }
      )
    }
    const pending = publications.filter((p) => p.status !== 'published')
    if (pending.length === 0)
      return NextResponse.json({ error: 'Already published' }, { status: 400 })

    // One destination at a time, each with its own credentials: a client publishing to two
    // networks must not send one network's post with the other's token.
    const outcomes = []
    for (const publication of pending) {
      const adapter = resolveNetwork(publication.platform)
      if (!adapter) continue
      const connection = await fetchConnection(admin, post.client_id, adapter.platform)
      const result = await publishOnePublication(admin, publication, post, connection, {
        skipPoll: true,
      })
      outcomes.push({ publication, adapter, outcome: result })
    }

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
    const { publication, adapter, outcome } = first

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

    switch (outcome.kind) {
      case 'published': {
        if (outcome.writeError) console.error(`[publish] ${outcome.writeError}`)
        return NextResponse.json({ ok: true, externalPostId: outcome.externalPostId, platforms })
      }
      case 'pending':
        // Finish out of band: this invocation keeps waiting after the response and completes
        // the publish; the client watches the post's status.
        after(() => resumePendingPublication(admin, publication.id, 40_000))
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
