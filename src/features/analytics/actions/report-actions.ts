'use server'

import { revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'
import type { Json } from '@/types'
import { getCachedAgency } from '@/lib/queries/cache'
import { archiveReportInputSchema, type ArchiveReportInput } from '../schemas'
import { periodFromBounds, type AnalyticsPeriod } from '../lib/period'
import { getAnalyticsReport, IG_METRICS_TAG } from '../lib/report-data'
import { buildFallbackNarrative, composeFreshNarrative, getNarrative } from '../lib/narrative'
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
  report: AnalyticsReportData,
  narrative: string
): Promise<ActionResult> {
  const { error } = await scope.supabase.from('analytics_reports').upsert(
    {
      client_id: scope.client.id,
      platform: 'instagram',
      period_start: scope.period.start,
      period_end: scope.period.end,
      // WHY as: AnalyticsReportData is plain data (checked by its tests); the
      // round-trip strips undefined so the value satisfies the Json column.
      metrics_json: JSON.parse(JSON.stringify(report)) as Json,
      ai_summary: narrative,
    },
    { onConflict: 'client_id,platform,period_start,period_end' }
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
  return upsertReportRow(scope, report, narrative)
}

/**
 * Rewrites the period's narrative on demand — the "generate a new report"
 * the live-fetch UI had. Live views recompose on the next render (the cache
 * tag is busted here); a period that was already exported gets its archive
 * row rewritten too, so its stored wording moves forward deliberately.
 */
export async function regenerateReport(input: ArchiveReportInput): Promise<ActionResult> {
  const resolved = await resolveReportScope(input)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved

  const report = await getAnalyticsReport(scope.client.id, scope.period, scope.timezone)
  if (!report.hasHistory) {
    return { ok: false, error: 'Nothing to write yet — the first sync runs tonight' }
  }

  const { data: existing, error: lookupError } = await scope.supabase
    .from('analytics_reports')
    .select('id')
    .eq('client_id', scope.client.id)
    .eq('period_start', scope.period.start)
    .eq('period_end', scope.period.end)
    .maybeSingle()
  if (lookupError) return { ok: false, error: lookupError.message }

  if (existing) {
    const narrative =
      (await composeFreshNarrative(
        scope.client.id,
        scope.client.name,
        scope.period,
        scope.timezone
      )) ?? buildFallbackNarrative(report)
    if (narrative === null) {
      return { ok: false, error: 'Nothing to write yet — no metrics in this period' }
    }
    const upserted = await upsertReportRow(scope, report, narrative)
    if (!upserted.ok) return upserted
  }

  // Bust the narrative (and data) cache: the next render composes fresh, or —
  // for an archive-linked window — reads the row rewritten above.
  revalidateTag(IG_METRICS_TAG, 'max')
  return { ok: true, data: undefined }
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
