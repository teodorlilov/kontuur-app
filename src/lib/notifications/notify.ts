import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationType } from '@/types/api'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * The one writer of `notifications`.
 *
 * There were five. This module held two of them behind a shared cooldown; the other three inserted
 * straight into the table — the approval-response notifier, and the two approval routes, which
 * built the same agency_id-only row and the same sentence a few files apart. Between them they set
 * no `type`, which `types/api.ts` declares as a closed set and the notification bell keys its
 * feedback badge off, and no `client_id`, while naming the client inside the message string. Those
 * rows cannot be linked back to a client at all.
 *
 * `message` is the dedup key, so a caller whose wording varies with an error re-notifies on every
 * tick. Keep the sentence phrase-stable for a given condition.
 */

/** Suppress duplicate notifications with the same message for this long. */
const NOTIFY_COOLDOWN_DAYS = 7

/**
 * A discrete event the user just caused, as opposed to a condition that persists.
 *
 * Sending an approval email twice in a week is two events and deserves two notifications; a token
 * that has been expiring for a week is one condition and deserves one. The cooldown is the right
 * default for the second and actively wrong for the first, which is why it is a number a caller
 * states rather than a behaviour baked into the insert.
 */
export const NOTIFY_EVERY_TIME = 0

export interface NotifyInput {
  /** Given directly, or resolved from `clientId`. One of the two is required. */
  agencyId?: string
  /** Stored on the row AND used to resolve the agency. Without it a notification cannot be
   *  attributed to a client, however clearly the message names one. */
  clientId?: string
  /** A sentence, or one built from the client's name — the name costs no extra query. */
  message: string | ((clientName: string) => string)
  /** The closed vocabulary the bell reads. Absent on rows written before this was one function. */
  type?: NotificationType
  /** Nullable rather than optional: the approval notifier holds `string | null` for a
   *  batch-wide response that names no single post. */
  postId?: string | null
  feedbackText?: string | null
  reviewToken?: string
  /** Days to suppress an identical message. `NOTIFY_EVERY_TIME` for user-caused events. */
  cooldownDays?: number
}

/**
 * Insert an agency notification, at most once per cooldown for the same message.
 *
 * Never throws on a failed insert — every caller reaches this after the thing it is reporting has
 * already happened, so failing here would report a completed action as broken. A cooldown-check
 * failure is different and does throw: reading it as "none sent" would re-notify on every tick,
 * which is the outcome the cooldown exists to prevent.
 */
export async function notify(admin: SupabaseClient, input: NotifyInput): Promise<void> {
  const { agencyId, clientName } = await resolveTarget(admin, input)
  if (!agencyId) return

  const message =
    typeof input.message === 'function' ? input.message(clientName ?? '') : input.message
  const cooldownDays = input.cooldownDays ?? NOTIFY_COOLDOWN_DAYS

  if (cooldownDays > 0) {
    const since = new Date(Date.now() - cooldownDays * MS_PER_DAY).toISOString()
    const { data: existing, error } = await admin
      .from('notifications')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('message', message)
      .gte('created_at', since)
      .limit(1)
    if (error) throw new Error(`notification cooldown check failed: ${error.message}`)
    if (existing && existing.length > 0) return
  }

  const { error } = await admin.from('notifications').insert({
    agency_id: agencyId,
    client_id: input.clientId ?? null,
    message,
    type: input.type ?? null,
    post_id: input.postId ?? null,
    feedback_text: input.feedbackText ?? null,
    review_token: input.reviewToken ?? null,
  })
  if (error) console.error('[notify] insert failed:', error.message)
}

/**
 * The agency to notify, and the client's name if a message wants it — in ONE query.
 *
 * Three callers each used to look up `clients.name`, then hand off to a helper that read the SAME
 * row again for its `agency_id`.
 */
async function resolveTarget(
  admin: SupabaseClient,
  input: NotifyInput
): Promise<{ agencyId: string | null; clientName: string | null }> {
  if (!input.clientId) return { agencyId: input.agencyId ?? null, clientName: null }

  const { data, error } = await admin
    .from('clients')
    .select('agency_id, name')
    .eq('id', input.clientId)
    .maybeSingle()
  if (error) throw new Error(`client lookup failed: ${error.message}`)
  const row = data as { agency_id: string | null; name: string } | null
  return { agencyId: input.agencyId ?? row?.agency_id ?? null, clientName: row?.name ?? null }
}
