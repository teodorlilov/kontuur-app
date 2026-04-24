import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

interface ApprovalNotificationData {
  agencyId: string
  clientName: string
  clientId: string
  postCount: number
  status: 'approved' | 'changes_requested'
  feedbackText: string | null
  reviewToken: string
  postId: string | null
}

/** Build the human-readable message for an approval notification. */
function buildMessage(clientName: string, status: string, postCount: number): string {
  if (status === 'approved') {
    return `${clientName} approved weekly calendar (${postCount} post${postCount === 1 ? '' : 's'})`
  }
  return `${clientName} requested changes on weekly calendar`
}

/** Insert an enriched notification row after a client approval response. Never throws — notification failure must not block the approval flow. */
export async function createApprovalNotification(
  supabase: SupabaseClient<Database>,
  data: ApprovalNotificationData
): Promise<void> {
  try {
    const message = buildMessage(data.clientName, data.status, data.postCount)
    const type = data.status === 'approved' ? 'client_approved_all' : 'client_feedback'

    await supabase.from('notifications').insert({
      agency_id: data.agencyId,
      message,
      type,
      client_id: data.clientId,
      post_id: data.postId,
      feedback_text: data.feedbackText,
      review_token: data.reviewToken,
    })
  } catch {
    // Notification insert must never block the approval flow
  }
}
