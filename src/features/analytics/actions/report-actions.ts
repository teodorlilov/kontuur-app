'use server'

import { revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'
import type { Json } from '@/types'
import { getCachedAgency } from '@/lib/queries/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { SOCIAL_CONNECTION_AUTH_COLUMNS } from '@/lib/queries/select-columns'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { toDateKey } from '@/utils/date-helpers'
import { archiveReportInputSchema, type ArchiveReportInput } from '../schemas'
import { periodFromBounds, type AnalyticsPeriod } from '../lib/period'
import { getAnalyticsReport, IG_METRICS_TAG } from '../lib/report-data'
import { refreshWindowMetrics } from '../lib/refresh-window'
import { buildFallbackNarrative, getNarrative } from '../lib/narrative'
import type { AnalyticsReportData } from '../lib/build-report'

interface ReportScope {
  client: { id: string; name: string }
  timezone: string
  period: AnalyticsPeriod
  supabase: SupabaseClient
}

/** Shared parse + auth + ownership + timezone resolution for the report actions. */
async function resolveReportScope(
  input: ArchiveReportInput
): Promise<{ ok: true; scope: ReportScope } | { ok: false; error: string }> {
  const parsed = archiveReportInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid report request' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const { clientId, preset, start, end } = parsed.data
  // WHY as: the auth-scoped client is untyped here, so the projection does not infer.
  const { data: client } = (await supabase
    .from('clients')
    .select('id, name, agency_id')
    .eq('id', clientId)
    .maybeSingle()) as { data: { id: string; name: string; agency_id: string } | null }
  if (!client || client.agency_id !== agencyId) return { ok: false, error: 'Not found' }

  const agency = await getCachedAgency(agencyId)
  return {
    ok: true,
    scope: {
      client: { id: client.id, name: client.name },
      timezone: agency?.timezone ?? 'UTC',
      period: periodFromBounds(preset, start, end),
      supabase,
    },
  }
}

async function upsertReportRow(
  scope: ReportScope,
  accountId: string,
  report: AnalyticsReportData,
  narrative: string
): Promise<ActionResult> {
  const { error } = await scope.supabase.from('analytics_reports').upsert(
    {
      client_id: scope.client.id,
      ig_account_id: accountId,
      platform: 'instagram',
      period_start: scope.period.start,
      period_end: scope.period.end,
      // WHY as: AnalyticsReportData is plain data (checked by its tests); the
      // round-trip strips undefined so the value satisfies the Json column.
      metrics_json: JSON.parse(JSON.stringify(report)) as Json,
      ai_summary: narrative,
    },
    { onConflict: 'client_id,ig_account_id,platform,period_start,period_end' }
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: undefined }
}

/**
 * Writes the currently displayed period into the report archive, exactly as
 * shown: the same stored-table data and the same narrative. Rows are keyed by
 * (client, platform, period), so re-exporting a period updates it in place.
 */
export async function archiveReport(input: ArchiveReportInput): Promise<ActionResult> {
  const resolved = await resolveReportScope(input)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved

  // The archive row is stamped with the account it describes — the account
  // scoping invariant applies to exported reports like every other read.
  // WHY as: the auth-scoped client is untyped here, so the projection does not infer.
  const { data: connRow } = (await scope.supabase
    .from('social_connections')
    .select('account_id')
    .eq('client_id', scope.client.id)
    .eq('platform', 'instagram')
    .maybeSingle()) as { data: { account_id: string | null } | null }
  const accountId = connRow?.account_id ?? null
  if (!accountId) {
    return { ok: false, error: 'Connect Instagram before exporting a report' }
  }

  const report = await getAnalyticsReport(scope.client.id, scope.period, scope.timezone)
  if (!report.hasHistory) {
    return { ok: false, error: 'Nothing to export yet — the first sync runs tonight' }
  }
  const narrative =
    (
      await getNarrative(
        scope.client.id,
        scope.client.name,
        scope.period,
        scope.timezone,
        report.lastSyncAt
      )
    )?.text ??
    buildFallbackNarrative(report) ??
    ''
  return upsertReportRow(scope, accountId, report, narrative)
}

/**
 * The automatic period fill: when the console lands on a window with days
 * never asked of Meta, the page mounts a client leaf that calls this once
 * (and again per run while the unfilled count keeps dropping). Same pull as
 * Regenerate, but silent, and it never rewrites archived reports or
 * narratives — it only completes the stored data and busts the caches.
 * Repeat calls are cheap by construction: marked days are never re-asked.
 */
export async function fillPeriodData(
  input: ArchiveReportInput
): Promise<ActionResult<{ filled: boolean }>> {
  const resolved = await resolveReportScope(input)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved
  const admin = createAdminSupabaseClient()

  // WHY as: the auth-scoped client is untyped here, so the projection does not infer.
  const { data: connection } = (await scope.supabase
    .from('social_connections')
    .select(SOCIAL_CONNECTION_AUTH_COLUMNS)
    .eq('client_id', scope.client.id)
    .eq('platform', 'instagram')
    .maybeSingle()) as {
    data: {
      account_id: string | null
      access_token: string | null
      token_expires_at: string | null
    } | null
  }
  if (
    !connection?.account_id ||
    !connection.access_token ||
    isTokenExpired(connection.token_expires_at)
  ) {
    return { ok: true, data: { filled: false } }
  }

  try {
    await refreshWindowMetrics(
      admin,
      {
        clientId: scope.client.id,
        accountId: connection.account_id,
        accessToken: connection.access_token,
      },
      scope.period,
      toDateKey(new Date(), scope.timezone)
    )
  } catch (err) {
    // Best-effort by design: the page already rendered from stored data.
    console.error('[analytics] automatic period fill failed', { clientId: scope.client.id, err })
    return { ok: true, data: { filled: false } }
  }

  revalidateTag(IG_METRICS_TAG, 'max')
  return { ok: true, data: { filled: true } }
}

/** Delete an analytics report by ID. */
export async function deleteReport(reportId: string): Promise<ActionResult> {
  const parsed = parseActionId(reportId, 'reportId')
  if (!parsed.ok) return parsed.result

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const { data: reportWithClient } = (await supabase
    .from('analytics_reports')
    .select('id, clients!inner(agency_id)')
    .eq('id', reportId)
    .single()) as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }

  if (!reportWithClient || reportWithClient.clients.agency_id !== agencyId) {
    return { ok: false, error: 'Not found' }
  }

  const { error } = await supabase.from('analytics_reports').delete().eq('id', reportId)
  if (error) return { ok: false, error: error.message }

  // The archive list is read fresh on each render; the caller refreshes the route.
  return { ok: true, data: undefined }
}
