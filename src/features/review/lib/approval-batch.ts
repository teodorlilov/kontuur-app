import type { SupabaseClient } from '@supabase/supabase-js'
import { APPROVAL_TOKEN_EXPIRY_HOURS } from '@/utils/constants'

type BatchResult =
  | { ok: true; batchId: string; postCount: number }
  | { ok: false; error: string; status: number }

export async function createApprovalBatch(
  supabase: SupabaseClient,
  clientId: string,
  weekStart: string,
  clientEmail: string | null = null
): Promise<BatchResult> {
  const weekStartDate = new Date(weekStart)
  if (isNaN(weekStartDate.getTime())) {
    return { ok: false, error: 'weekStart must be a valid ISO date', status: 400 }
  }

  const weekEnd = new Date(weekStartDate)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id')
    .eq('client_id', clientId)
    .gte('scheduled_at', weekStartDate.toISOString())
    .lte('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  if (postsError) return { ok: false, error: postsError.message, status: 500 }
  if (!posts || posts.length === 0) {
    return { ok: false, error: 'No posts scheduled for this week', status: 400 }
  }

  const postIds = posts.map((p) => p.id)
  const batchId = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + APPROVAL_TOKEN_EXPIRY_HOURS)

  // Remove any existing tokens for these posts before creating the new batch
  await supabase.from('post_approval_tokens').delete().in('post_id', postIds)

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

  return { ok: true, batchId, postCount: posts.length }
}
