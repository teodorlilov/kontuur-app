import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationType } from '@/types/api'
import type { Database } from '@/types/database'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * The one insert into `notifications` (shell-context.tsx only marks rows read), with two ways to
 * land once. An EVENT (a trial ending on a
 * date, a period's allowance crossing a line) passes `dedupKey`: the unique
 * `(agency_id, dedup_key)` index (migration 20260861) makes a repeat write nothing, even from two
 * invocations at once. A CONDITION that persists (a publish failing, a connection retired) is held
 * back by `cooldownDays` on the sentence instead, so `message` is its dedup key: keep it
 * phrase-stable for a given condition, or it re-notifies on every tick.
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

interface NotifyInput {
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
  /**
   * The event's identity, for an event that must land once however often it is reported. With a
   * key the cooldown is not read: the unique index is the dedup.
   */
  dedupKey?: string
}

/**
 * What `notify` did: wrote the row, held it back (a repeat key, the cooldown, or no agency to
 * notify), or could not write it.
 */
type NotifyOutcome = 'written' | 'suppressed' | 'failed'

/**
 * Insert an agency notification — once per `dedupKey`, or at most once per cooldown for the same
 * message — and say what happened: the billing cron (src/lib/billing/reminders.ts) mails only
 * behind 'written', so a redelivered tick never mails twice. A keyed upsert returns only a row it
 * inserted, so an empty answer is a repeat.
 *
 * Never throws on a failed insert: the thing being reported has already happened, and a throw
 * would report it as broken. A failed cooldown check does throw — read as "none sent", it would
 * re-notify on every tick.
 */
export async function notify(
  admin: SupabaseClient<Database>,
  input: NotifyInput
): Promise<NotifyOutcome> {
  const { agencyId, clientName } = await resolveTarget(admin, input)
  if (!agencyId) return 'suppressed'

  const message =
    typeof input.message === 'function' ? input.message(clientName ?? '') : input.message
  const row = {
    agency_id: agencyId,
    client_id: input.clientId ?? null,
    message,
    type: input.type ?? null,
    post_id: input.postId ?? null,
    feedback_text: input.feedbackText ?? null,
    review_token: input.reviewToken ?? null,
  }

  if (input.dedupKey) {
    const { data, error } = await admin
      .from('notifications')
      .upsert(
        { ...row, dedup_key: input.dedupKey },
        { onConflict: 'agency_id,dedup_key', ignoreDuplicates: true }
      )
      .select('id')
    if (error) {
      console.error('[notify] insert failed:', error.message)
      return 'failed'
    }
    return data.length > 0 ? 'written' : 'suppressed'
  }

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
    if (existing && existing.length > 0) return 'suppressed'
  }

  const { error } = await admin.from('notifications').insert(row)
  if (error) {
    console.error('[notify] insert failed:', error.message)
    return 'failed'
  }
  return 'written'
}

/**
 * The agency to notify, and the client's name if a message wants it — in ONE query.
 *
 * Three callers each used to look up `clients.name`, then hand off to a helper that read the SAME
 * row again for its `agency_id`.
 */
async function resolveTarget(
  admin: SupabaseClient<Database>,
  input: NotifyInput
): Promise<{ agencyId: string | null; clientName: string | null }> {
  if (!input.clientId) return { agencyId: input.agencyId ?? null, clientName: null }

  const { data, error } = await admin
    .from('clients')
    .select('agency_id, name')
    .eq('id', input.clientId)
    .maybeSingle()
  if (error) throw new Error(`client lookup failed: ${error.message}`)
  return { agencyId: input.agencyId ?? data?.agency_id ?? null, clientName: data?.name ?? null }
}
