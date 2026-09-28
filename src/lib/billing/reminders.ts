import 'server-only'

import type { AdminClient } from '@/lib/supabase/admin'
import { AGENCY_ENTITLEMENT_COLUMNS, USER_CONTACT_COLUMNS } from '@/lib/queries/select-columns'
import { fetchAgencyById } from '@/lib/queries/db'
import { notify } from '@/lib/notifications/notify'
import { sendEmail } from '@/lib/email/resend'
import { reminderEmail } from '@/lib/email/templates'
import { resolveAppUrl } from '@/utils/url'
import { MS_PER_DAY, PLAN_AND_BILLING_PATH } from '@/utils/constants'
import type { BillingReminderType } from '@/types/api'
import { entitlementFor, type Entitlement } from './entitlement'
import { shellNotice, workspacePaused } from './copy'
import { GRACE_DAYS, TRIAL_NOTICE_DAYS } from './plans'

/**
 * How long after its grace ran out a paused workspace is still told so. A cron outage of a few
 * days must not lose the message; a workspace paused months ago must not be woken by it.
 */
const PAUSED_WINDOW_DAYS = 7

interface Reminder {
  type: BillingReminderType
  message: string
  /** The event's identity for `notify` — see `reminderKey`. */
  dedupKey: string
}

/**
 * A reminder's event identity: its kind and the UTC date it is about — the trial's end for the
 * three trial reminders, the first failed payment for `payment_failed`. The same form migration
 * 20260861 backfilled onto the rows written before keys, so a reminder sent before the deploy is
 * not sent again after it, and a new timezone or reworded sentence never re-sends one.
 */
function reminderKey(type: BillingReminderType, about: Date): string {
  return `${type}:${about.toISOString().slice(0, 10)}`
}

/**
 * Picks the reminder a trial workspace is due at `now`, with the sentence it carries — null when
 * there is none. Pure.
 *
 * The sentence is the one the shell shows for the same state (`shellNotice`), so the banner, the
 * bell and the email never disagree; the key is the trial's end (`reminderKey`), so a tick
 * redelivered tomorrow writes nothing. A paid or house workspace is never due: its states are not
 * the trial's.
 */
export function pickReminder(entitlement: Entitlement, now: Date): Reminder | null {
  const { trialEndsAt } = entitlement
  if (!trialEndsAt) return null
  const notice = shellNotice(entitlement, now)
  if (entitlement.state === 'trial') {
    return notice
      ? {
          type: 'trial_ending',
          message: notice.text,
          dedupKey: reminderKey('trial_ending', trialEndsAt),
        }
      : null
  }
  if (entitlement.state === 'trial_grace') {
    return notice
      ? {
          type: 'trial_ended',
          message: notice.text,
          dedupKey: reminderKey('trial_ended', trialEndsAt),
        }
      : null
  }
  const pausedAt = entitlement.graceEndsAt?.getTime()
  if (
    entitlement.state === 'locked' &&
    pausedAt !== undefined &&
    now.getTime() - pausedAt <= PAUSED_WINDOW_DAYS * MS_PER_DAY
  ) {
    return {
      type: 'workspace_paused',
      message: workspacePaused(entitlement),
      dedupKey: reminderKey('workspace_paused', trialEndsAt),
    }
  }
  return null
}

/** What one reminder came to — the caller tallies, the sender never throws for a send. */
type RemindOutcome =
  | { outcome: 'suppressed' | 'unwritten' | 'no_admin' | 'emailed' }
  | { outcome: 'send_failed'; error: string }

function planUrl(): string {
  return `${resolveAppUrl()}${PLAN_AND_BILLING_PATH}`
}

/**
 * The admins' emails of these workspaces, by agency — the one users read behind every reminder:
 * the cron's whole due list at once, or the webhook's one workspace.
 */
async function fetchAdminEmails(
  admin: AdminClient,
  agencyIds: string[]
): Promise<Map<string, string[]>> {
  const { data, error } = await admin
    .from('users')
    .select(USER_CONTACT_COLUMNS)
    .in('agency_id', agencyIds)
    .eq('role', 'admin')
  if (error) throw new Error(`admin roster query failed: ${error.message}`)
  const byAgency = new Map<string, string[]>()
  for (const user of data ?? []) {
    byAgency.set(user.agency_id, [...(byAgency.get(user.agency_id) ?? []), user.email])
  }
  return byAgency
}

/**
 * One reminder to one workspace: the bell row through `notify`, keyed by the event, and — only
 * behind a row that was actually written, so a redelivered tick or a retried event never mails
 * twice — one email to the addresses given. The bell row is the durable record and the dedup;
 * a send the provider refuses is reported, not retried, since retrying would mean writing the row
 * twice.
 */
export async function remindWorkspace(
  admin: AdminClient,
  input: Reminder & { agencyId: string; to: string[] }
): Promise<RemindOutcome> {
  const wrote = await notify(admin, {
    agencyId: input.agencyId,
    type: input.type,
    message: input.message,
    dedupKey: input.dedupKey,
  })
  if (wrote === 'suppressed') return { outcome: 'suppressed' }
  if (wrote === 'failed') return { outcome: 'unwritten' }
  if (input.to.length === 0) return { outcome: 'no_admin' }
  try {
    await sendEmail({ to: input.to, content: reminderEmail(input.type, input.message, planUrl()) })
    return { outcome: 'emailed' }
  } catch (err) {
    return { outcome: 'send_failed', error: err instanceof Error ? err.message : String(err) }
  }
}

interface ReminderOutcome {
  /** Trial workspaces examined this tick. */
  checked: number
  /** Bell rows written, by kind — one whose key was already written is not counted. */
  notified: Record<BillingReminderType, number>
  emailed: number
  errors: Array<{ agencyId: string; error: string }>
}

/**
 * Reminds every trial workspace whose moment is today, through `remindWorkspace`. The roster is
 * read in its window only — a trial ending within `TRIAL_NOTICE_DAYS`, or one whose grace ran
 * out within `PAUSED_WINDOW_DAYS` — so it grows with the workspaces that have something to hear,
 * not with every trial ever started. The due list and the admins to mail are resolved before
 * anything is written — one agencies read and one users read per tick (`fetchAdminEmails`) — so a
 * failed read leaves no row behind and the next tick is a clean retry. A row that could not be
 * written, a workspace with no admin to mail and a send the provider refused are all reported in
 * `errors` — data problems worth seeing in the totals, not ones to hide. `payment_failed` is the
 * webhook's and stays at zero here.
 */
export async function remindTrialWorkspaces(
  admin: AdminClient,
  now: Date = new Date()
): Promise<ReminderOutcome> {
  const { data: agencies, error } = await admin
    .from('agencies')
    .select(AGENCY_ENTITLEMENT_COLUMNS)
    .is('stripe_subscription_id', null)
    .gte(
      'trial_ends_at',
      new Date(now.getTime() - (GRACE_DAYS + PAUSED_WINDOW_DAYS) * MS_PER_DAY).toISOString()
    )
    .lte('trial_ends_at', new Date(now.getTime() + TRIAL_NOTICE_DAYS * MS_PER_DAY).toISOString())
  if (error) throw new Error(`trial roster query failed: ${error.message}`)

  const outcome: ReminderOutcome = {
    checked: 0,
    notified: { trial_ending: 0, trial_ended: 0, workspace_paused: 0, payment_failed: 0 },
    emailed: 0,
    errors: [],
  }
  const fail = (agencyId: string, err: unknown) =>
    outcome.errors.push({ agencyId, error: err instanceof Error ? err.message : String(err) })

  const due: Array<Reminder & { agencyId: string }> = []
  for (const row of agencies ?? []) {
    outcome.checked++
    const reminder = pickReminder(entitlementFor(row, now), now)
    if (reminder) due.push({ agencyId: row.id, ...reminder })
  }
  if (due.length === 0) return outcome

  const emailsByAgency = await fetchAdminEmails(
    admin,
    due.map((item) => item.agencyId)
  )

  for (const item of due) {
    try {
      const result = await remindWorkspace(admin, {
        ...item,
        to: emailsByAgency.get(item.agencyId) ?? [],
      })
      if (result.outcome === 'suppressed') continue
      if (result.outcome === 'unwritten') {
        fail(item.agencyId, 'bell row not written')
        continue
      }
      outcome.notified[item.type]++
      if (result.outcome === 'no_admin') fail(item.agencyId, 'no admin to email')
      else if (result.outcome === 'send_failed') fail(item.agencyId, result.error)
      else outcome.emailed++
    } catch (err) {
      fail(item.agencyId, err)
    }
  }
  return outcome
}

/**
 * The webhook's reminder after a failed renewal. The row is read fresh — the snapshot has just
 * written `past_due_since` — so the sentence says by when the card is due, and the workspace's
 * admins get the bell and the email through the same sender the cron uses. Nothing when the row
 * no longer says past_due: a retry that lands after the customer paid, or after the grace ran
 * out. Keyed by the first failed payment's date, so one past-due episode rings once however many
 * retries fail.
 */
export async function remindPaymentFailed(
  admin: AdminClient,
  agencyId: string,
  now: Date = new Date()
): Promise<RemindOutcome | null> {
  const row = await fetchAgencyById(admin, agencyId)
  if (!row?.past_due_since) return null
  const entitlement = entitlementFor(row, now)
  const notice = shellNotice(entitlement, now)
  if (entitlement.state !== 'past_due' || !notice) return null
  const to = (await fetchAdminEmails(admin, [agencyId])).get(agencyId) ?? []
  return remindWorkspace(admin, {
    agencyId,
    type: 'payment_failed',
    message: notice.text,
    dedupKey: reminderKey('payment_failed', new Date(row.past_due_since)),
    to,
  })
}
