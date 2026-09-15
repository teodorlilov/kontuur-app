import 'server-only'

import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { AGENCY_ENTITLEMENT_COLUMNS, USER_CONTACT_COLUMNS } from '@/lib/queries/select-columns'
import { notify } from '@/lib/notifications/notify'
import { sendEmail } from '@/lib/email/resend'
import { reminderEmail } from '@/lib/email/templates'
import { resolveAppUrl } from '@/utils/url'
import { MS_PER_DAY, PLAN_AND_BILLING_PATH } from '@/utils/constants'
import type { BillingReminderType } from '@/types/api'
import { entitlementFor, type Entitlement } from './entitlement'
import { shellNotice, workspacePaused } from './copy'

type AdminClient = ReturnType<typeof createAdminSupabaseClient>

/**
 * How long after its grace ran out a paused workspace is still told so. A cron outage of a few
 * days must not lose the message; a workspace paused months ago must not be woken by it.
 */
const PAUSED_WINDOW_DAYS = 7

/** Identical reminders are suppressed for this long — longer than any trial, grace or window. */
const REMINDER_COOLDOWN_DAYS = 31

interface Reminder {
  type: BillingReminderType
  message: string
}

/**
 * Picks the reminder a trial workspace is due at `now`, with the sentence it carries — null when
 * there is none. Pure.
 *
 * The sentence is the one the shell shows for the same state (`shellNotice`), so the banner, the
 * bell and the email never disagree — and because it names the date, `notify` can dedup on it:
 * a tick redelivered tomorrow finds the same sentence and writes nothing. A paid or house
 * workspace is never due: its states are not the trial's.
 */
export function pickReminder(entitlement: Entitlement, now: Date): Reminder | null {
  const notice = shellNotice(entitlement, now)
  if (entitlement.state === 'trial') {
    return notice ? { type: 'trial_ending', message: notice.text } : null
  }
  if (entitlement.state === 'trial_grace') {
    return notice ? { type: 'trial_ended', message: notice.text } : null
  }
  const pausedAt = entitlement.graceEndsAt?.getTime()
  if (
    entitlement.state === 'locked' &&
    pausedAt !== undefined &&
    now.getTime() - pausedAt <= PAUSED_WINDOW_DAYS * MS_PER_DAY
  ) {
    return { type: 'workspace_paused', message: workspacePaused(entitlement) }
  }
  return null
}

interface ReminderOutcome {
  /** Trial workspaces examined this tick. */
  checked: number
  /** Bell rows written, by kind — a row the cooldown held back is not counted. */
  notified: Record<BillingReminderType, number>
  emailed: number
  errors: Array<{ agencyId: string; error: string }>
}

/**
 * Reminds every trial workspace whose moment is today: a bell row through `notify`, and — only
 * behind a row that was actually written, so a redelivered tick never mails twice — one email to
 * the workspace's admins.
 *
 * The due list and the admins to mail are resolved before anything is written — one agencies
 * read and one users read per tick — so a failed read leaves no row behind and the next tick is
 * a clean retry. Then, per workspace: the bell row first, because it is the durable record and
 * the dedup key a redelivered tick finds, and the email only behind it. An email the provider
 * refuses is counted in `errors` and not retried, since retrying would mean writing the row
 * twice; a row that could not be written, and a workspace with no admin to mail, are reported
 * the same way — data problems worth seeing in the totals, not ones to hide.
 */
export async function remindTrialWorkspaces(
  admin: AdminClient,
  now: Date = new Date()
): Promise<ReminderOutcome> {
  const { data: agencies, error } = await admin
    .from('agencies')
    .select(AGENCY_ENTITLEMENT_COLUMNS)
    .is('stripe_subscription_id', null)
  if (error) throw new Error(`trial roster query failed: ${error.message}`)

  const outcome: ReminderOutcome = {
    checked: 0,
    notified: { trial_ending: 0, trial_ended: 0, workspace_paused: 0 },
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

  const { data: admins, error: adminError } = await admin
    .from('users')
    .select(USER_CONTACT_COLUMNS)
    .in(
      'agency_id',
      due.map((item) => item.agencyId)
    )
    .eq('role', 'admin')
  if (adminError) throw new Error(`admin roster query failed: ${adminError.message}`)
  const emailsByAgency = new Map<string, string[]>()
  for (const user of admins ?? []) {
    emailsByAgency.set(user.agency_id, [...(emailsByAgency.get(user.agency_id) ?? []), user.email])
  }

  const planUrl = `${resolveAppUrl()}${PLAN_AND_BILLING_PATH}`
  for (const item of due) {
    try {
      const wrote = await notify(admin, {
        agencyId: item.agencyId,
        type: item.type,
        message: item.message,
        cooldownDays: REMINDER_COOLDOWN_DAYS,
      })
      if (wrote === 'suppressed') continue
      if (wrote === 'failed') {
        fail(item.agencyId, 'bell row not written')
        continue
      }
      outcome.notified[item.type]++
      const to = emailsByAgency.get(item.agencyId)
      if (!to?.length) {
        fail(item.agencyId, 'no admin to email')
        continue
      }
      await sendEmail({ to, content: reminderEmail(item.type, item.message, planUrl) })
      outcome.emailed++
    } catch (err) {
      fail(item.agencyId, err)
    }
  }
  return outcome
}
