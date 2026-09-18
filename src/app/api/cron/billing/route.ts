import { type NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { remindTrialWorkspaces } from '@/lib/billing/reminders'
import { retryUndeliveredDocuments } from '@/lib/billing/documents'
import { unauthorizedCron } from '@/lib/cron/authorize-cron'

export const maxDuration = 60

/**
 * Cron endpoint — the daily billing reminders: a trial in its last three days, a trial that has
 * just ended, a workspace whose grace has run out. Each lands once as a bell row and once as an
 * email to the workspace's admins; a redelivered tick writes and mails nothing. Then the one
 * backstop for the documents: any invoice or credit note nobody received goes through delivery
 * again. Spends nothing.
 */
export async function GET(request: NextRequest) {
  const unauthorized = unauthorizedCron(request)
  if (unauthorized) return unauthorized

  try {
    const admin = createAdminSupabaseClient()
    const result = await remindTrialWorkspaces(admin)
    if (result.errors.length > 0) {
      console.error('[cron:billing] per-workspace errors:', result.errors)
    }
    const documents = await retryUndeliveredDocuments(admin)
    console.info(
      `[cron:billing] run complete: ${result.checked} checked, ` +
        `${result.notified.trial_ending} ending, ${result.notified.trial_ended} ended, ` +
        `${result.notified.workspace_paused} paused, ${result.emailed} emailed; ` +
        `${documents.delivered} of ${documents.retried} documents delivered`
    )
    return NextResponse.json({ ...result, documents })
  } catch (err) {
    console.error('[cron:billing] run failed:', err)
    return NextResponse.json({ error: 'Billing reminders failed' }, { status: 500 })
  }
}
