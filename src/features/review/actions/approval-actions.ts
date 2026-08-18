'use server'

import 'server-only'
import { revalidateTag } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createApprovalNotification } from '@/features/review/lib/create-approval-notification'
import { submitApprovalSchema, type ApprovalStatus } from '@/features/review/schemas'
import { formatZodIssues } from '@/lib/validation/format-issues'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Submit an approval/changes-requested response for a batch of posts.
 *
 * Unauthenticated by design — the URL token is the credential — and running on the
 * service-role client, so the argument list is a public boundary and is parsed as one.
 * It used to hand-check `status` and take `postNotes` on trust: an uncapped array of
 * uncapped strings written straight to `client_note` by anyone holding the link.
 */
export async function submitApproval(
  token: string,
  status: ApprovalStatus,
  postNotes?: Array<{ postId: string; note: string }>
): Promise<ActionResult> {
  const parsed = submitApprovalSchema.safeParse({ token, status, postNotes })
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error).join('; ') }
  }
  const { token: batchId, status: verdict, postNotes: notes } = parsed.data

  const supabase = createAdminSupabaseClient()

  const { data: tokenRows, error } = await supabase
    .from('post_approval_tokens')
    .select('id, post_id, status, expires_at')
    .eq('batch_id', batchId)

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
    .update({ status: verdict, responded_at: new Date().toISOString() })
    .eq('batch_id', batchId)

  if (updateError) return { ok: false, error: updateError.message }

  if (notes && notes.length > 0) {
    await Promise.all(
      notes.map(({ postId, note }) =>
        supabase
          .from('post_approval_tokens')
          .update({ client_note: note })
          .eq('batch_id', batchId)
          .eq('post_id', postId)
      )
    )
  }

  const postIds = tokenRows.map((r) => r.post_id)

  const { data: postWithClient } = await supabase
    .from('posts')
    .select('client_id, clients!inner(name, agency_id)')
    .eq('id', postIds[0]!)
    .single() as { data: { client_id: string; clients: { name: string; agency_id: string } } | null }

  if (postWithClient) {
    const firstNote = notes?.[0]?.note ?? null
    await createApprovalNotification(supabase, {
      agencyId: postWithClient.clients.agency_id,
      clientName: postWithClient.clients.name,
      clientId: postWithClient.client_id,
      postCount: postIds.length,
      status: verdict,
      feedbackText: verdict === 'changes_requested' ? firstNote : null,
      reviewToken: batchId,
      postId: postIds[0] ?? null,
    })
  }

  revalidateTag('client-post-stats', 'max')
  return { ok: true, data: undefined }
}
