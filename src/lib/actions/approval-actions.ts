'use server'

import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createApprovalNotification } from '@/lib/notifications/create-approval-notification'
import type { ActionResult } from './types'

/** Submit an approval/changes-requested response for a batch of posts. */
export async function submitApproval(
  token: string,
  status: 'approved' | 'changes_requested',
  postNotes?: Array<{ postId: string; note: string }>
): Promise<ActionResult> {
  if (status !== 'approved' && status !== 'changes_requested') {
    return { ok: false, error: 'status must be "approved" or "changes_requested"' }
  }

  const supabase = createAdminSupabaseClient()

  const { data: tokenRows, error } = await supabase
    .from('post_approval_tokens')
    .select('id, post_id, status, expires_at')
    .eq('batch_id', token)

  if (error || !tokenRows || tokenRows.length === 0) {
    return { ok: false, error: 'Invalid approval link' }
  }

  const firstRow = tokenRows[0]!
  if (new Date(firstRow.expires_at) < new Date()) {
    return { ok: false, error: 'This approval link has expired' }
  }

  if (firstRow.status !== 'pending') {
    return { ok: false, error: 'This approval has already been responded to' }
  }

  const { error: updateError } = await supabase
    .from('post_approval_tokens')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('batch_id', token)

  if (updateError) return { ok: false, error: updateError.message }

  if (postNotes && postNotes.length > 0) {
    for (const { postId, note } of postNotes) {
      await supabase
        .from('post_approval_tokens')
        .update({ client_note: note })
        .eq('batch_id', token)
        .eq('post_id', postId)
    }
  }

  const postIds = tokenRows.map((r) => r.post_id)

  const { data: postWithClient } = await supabase
    .from('posts')
    .select('client_id, clients!inner(name, agency_id)')
    .eq('id', postIds[0]!)
    .single() as { data: { client_id: string; clients: { name: string; agency_id: string } } | null }

  if (postWithClient) {
    const firstNote = postNotes?.[0]?.note ?? null
    await createApprovalNotification(supabase, {
      agencyId: postWithClient.clients.agency_id,
      clientName: postWithClient.clients.name,
      clientId: postWithClient.client_id,
      postCount: postIds.length,
      status,
      feedbackText: status === 'changes_requested' ? firstNote : null,
      reviewToken: token,
      postId: postIds[0] ?? null,
    })
  }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}
