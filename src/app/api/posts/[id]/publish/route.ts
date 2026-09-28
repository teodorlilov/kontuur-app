import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { NextResponse, after } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import { fetchOwnedPost } from '@/lib/auth/helpers'
import {
  PUBLISHABLE_POST_COLUMNS,
  publishOnePublication,
  resumePendingPublication,
} from '@/features/publishing/lib/publish-post'
import { assignDestinations } from '@/features/publishing/lib/destinations'
import { isClaimLive } from '@/features/publishing/lib/scheduler'
import { fetchConnection } from '@/lib/queries/db'
import { resolveNetwork } from '@/lib/meta/networks'
import { statusForSlot } from '@/lib/posts/status-for-slot'
import { toPostType } from '@/lib/visual/visual-backlog'

// The after() continuation waits for up to ~40s past the response.
export const maxDuration = 60

/**
 * Publish a post now through `publishOnePublication`, the cron's own path, so the claim and retry
 * ladder cannot diverge. The reply goes once each network has accepted the content and its
 * reference is persisted; EVERY destination left pending is resumed in `after()` on a bounded
 * poll, with the cron's resume arm as the backstop. Each destination uses its OWN credentials and claim, and one inside a
 * live claim window is skipped, or the network gets the post twice (`isClaimLive`,
 * src/features/publishing/lib/scheduler.ts). A never-scheduled post gets its slot AND its
 * `statusForSlot` status: the cron's due query only sees posts with a slot, and the calendar splits
 * on the pair (src/features/calendar/hooks/use-calendar.ts); a failed stamp is only logged, and a
 * pending publish without a slot has no backstop. The reply leads with a pending outcome, then a
 * published one, then a failure, so the button says "publishing…" while any destination is
 * mid-send. `platforms` never names a failed network: the card marks each one it lists as
 * published.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const refused = await requireEntitledRoute(auth.agencyId, 'publish')
  if (refused) return refused

  const ownership = await fetchOwnedPost(auth.supabase, postId, auth.agencyId)
  if (!ownership) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const admin = createAdminSupabaseClient()

  try {
    const { data: post, error } = await admin
      .from('posts')
      .select(`${PUBLISHABLE_POST_COLUMNS}, scheduled_at`)
      .eq('id', postId)
      .maybeSingle()
    if (error) throw new Error(`post lookup failed: ${error.message}`)
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const postType = toPostType(post.post_type)
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

    const claimCheckAt = new Date()
    const actionable = pending.filter((publication) => !isClaimLive(publication, claimCheckAt))
    if (actionable.length === 0)
      return NextResponse.json({ error: 'Post is already being published' }, { status: 409 })

    const settled = await Promise.allSettled(
      actionable.map(async (publication) => {
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

    const first =
      outcomes.find((o) => o.outcome.kind === 'pending') ??
      outcomes.find((o) => o.outcome.kind === 'published') ??
      outcomes[0]
    if (!first) throw new Error(`no destination was attempted for post ${postId}`)
    const { adapter, outcome } = first

    const publishedNow = new Date().toISOString()
    if (!post.scheduled_at && (outcome.kind === 'published' || outcome.kind === 'pending')) {
      const { error: slotError } = await admin
        .from('posts')
        .update({ scheduled_at: publishedNow, status: statusForSlot(publishedNow) })
        .eq('id', postId)
      if (slotError) console.error(`[publish] slot stamp failed for ${postId}:`, slotError.message)
    }

    const platforms = outcomes
      .filter((o) => o.outcome.kind !== 'failed')
      .map((o) => o.publication.platform)

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
