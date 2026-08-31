import type { SupabaseClient } from '@supabase/supabase-js'
import { APPROVAL_TOKEN_EXPIRY_HOURS } from '@/utils/constants'
import { getWeekRange } from '@/utils/date-helpers'

type BatchResult =
  | { ok: true; batchId: string; postCount: number }
  | { ok: false; error: string; status: number }

/**
 * `timeZone` is required rather than defaulted. A default would let a route that forgot
 * to pass it quietly build a UTC window and email the wrong week — which is the exact
 * bug this parameter exists to close, so a missing argument must be a build error.
 * It is unused on the explicit-postIds path, which names its posts directly.
 */
export async function createApprovalBatch(
  supabase: SupabaseClient,
  clientId: string,
  weekStart: string | null,
  timeZone: string,
  clientEmail: string | null = null,
  options?: { postIds?: string[] }
): Promise<BatchResult> {
  let postIds: string[]

  if (options?.postIds && options.postIds.length > 0) {
    // Explicit selection — the queue's send-to-client. Every id must belong to
    // this client, otherwise the whole batch is refused.
    const { data: owned, error: ownedError } = await supabase
      .from('posts')
      .select('id')
      .eq('client_id', clientId)
      .in('id', options.postIds)
      .order('created_at', { ascending: true })
    if (ownedError) return { ok: false, error: ownedError.message, status: 500 }
    if (!owned || owned.length !== options.postIds.length) {
      return { ok: false, error: 'Some posts do not belong to this client', status: 400 }
    }
    postIds = owned.map((p) => p.id)
  } else {
    if (isNaN(new Date(weekStart ?? '').getTime())) {
      return { ok: false, error: 'weekStart must be a valid ISO date', status: 400 }
    }

    // getWeekRange, not `new Date(weekStart)` + 6 days + setHours(23,59,59,999).
    // That version resolved both ends in the *server's* zone — UTC on Vercel — while
    // the calendar that labelled the button resolved them in the agency's, so for any
    // agency off UTC the token covered a different set of posts than the button
    // promised. It was also inclusive-end where this is half-open.
    const { from, to } = getWeekRange(weekStart!, timeZone)

    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id')
      .eq('client_id', clientId)
      .gte('scheduled_at', from)
      .lt('scheduled_at', to)
      .order('scheduled_at', { ascending: true })

    if (postsError) return { ok: false, error: postsError.message, status: 500 }
    if (!posts || posts.length === 0) {
      return { ok: false, error: 'No posts scheduled for this week', status: 400 }
    }
    postIds = posts.map((p) => p.id)
  }
  const batchId = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + APPROVAL_TOKEN_EXPIRY_HOURS)

  // Remove any existing tokens for these posts before creating the new batch.
  // Leaving stale tokens alive would keep older approval links working against
  // the same posts, so a failed cleanup has to stop the batch.
  const { error: cleanupError } = await supabase
    .from('post_approval_tokens')
    .delete()
    .in('post_id', postIds)
  if (cleanupError) return { ok: false, error: cleanupError.message, status: 500 }

  const tokenRows = postIds.map((postId) => ({
    post_id: postId,
    token: crypto.randomUUID(),
    batch_id: batchId,
    client_email: clientEmail,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
  }))

  const { error: insertError } = await supabase.from('post_approval_tokens').insert(tokenRows)
  if (insertError) return { ok: false, error: insertError.message, status: 500 }

  return { ok: true, batchId, postCount: postIds.length }
}
