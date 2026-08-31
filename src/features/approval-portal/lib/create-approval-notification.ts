import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { notify, NOTIFY_EVERY_TIME } from '@/features/publishing/lib/notifications'

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

    // A client responding is a discrete event, so it notifies every time. The 7-day cooldown
    // would swallow a second change request on the same calendar within a week — the case the
    // agency most needs to see.
    await notify(supabase, {
      agencyId: data.agencyId,
      clientId: data.clientId,
      message,
      type,
      postId: data.postId,
      feedbackText: data.feedbackText,
      reviewToken: data.reviewToken,
      cooldownDays: NOTIFY_EVERY_TIME,
    })
  } catch {
    // Notification insert must never block the approval flow
  }
}
