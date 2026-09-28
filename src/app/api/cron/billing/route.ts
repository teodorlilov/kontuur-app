import { type NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { remindTrialWorkspaces } from '@/lib/billing/reminders'
import { retryUndeliveredDocuments } from '@/lib/billing/documents'
import { clearStaleReservations } from '@/lib/billing/usage'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'

export const maxDuration = 60

/**
 * No document delivery starts past this point, so the one in flight — a cold Chromium start, the
 * render, the upload and the send — has the last 20 s of `maxDuration` to finish in.
 */
const TIME_BUDGET_MS = 40_000

/** Run one job of the tick: its result, or null once its failure is logged under its own name. */
async function job<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (err) {
    console.error(`[cron:billing] ${name} failed:`, err)
    return null
  }
}

/**
 * Cron endpoint — three independent daily jobs, cheapest first, so a failure or a timeout in one
 * never skips another: every allowance reservation a killed invocation never settled is released
 * (`clearStaleReservations`); the billing reminders go out — a trial in its last three days, a
 * trial that has just ended, a workspace whose grace has run out, each once as a bell and once as
 * an email to the admins, so a redelivered tick writes and mails nothing; and every invoice or
 * credit note nobody received goes through delivery again, oldest first, until `TIME_BUDGET_MS`
 * after the tick began — what it leaves waits for the next day. The release runs first because it
 * is the one a missed day costs the customer for: a stranded reservation holds their cap. Answers
 * 500 when any job failed, with what the others did. Spends nothing.
 */
export async function GET(request: NextRequest) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const admin = createAdminSupabaseClient()
  const reservationsCleared = await job('reservation release', () => clearStaleReservations(admin))
  const reminders = await job('reminders', () => remindTrialWorkspaces(admin))
  if (reminders && reminders.errors.length > 0) {
    console.error('[cron:billing] per-workspace errors:', reminders.errors)
  }
  const documents = await job('document retry', () =>
    retryUndeliveredDocuments(admin, startedAt + TIME_BUDGET_MS)
  )

  console.info(
    `[cron:billing] run complete: ${reservationsCleared ?? 'failed'} stale reservations cleared; ` +
      (reminders
        ? `${reminders.checked} checked, ${reminders.notified.trial_ending} ending, ` +
          `${reminders.notified.trial_ended} ended, ${reminders.notified.workspace_paused} paused, ` +
          `${reminders.emailed} emailed; `
        : 'reminders failed; ') +
      (documents
        ? `${documents.delivered} of ${documents.retried} documents delivered`
        : 'document retry failed')
  )
  const failed = reservationsCleared === null || reminders === null || documents === null
  return NextResponse.json(
    { reservationsCleared, reminders, documents },
    { status: failed ? 500 : 200 }
  )
}
