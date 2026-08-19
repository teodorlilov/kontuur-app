'use server'

import { resolveActionAuth } from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'
import type { Json } from '@/types'
import { getCachedAgency } from '@/lib/queries/cache'
import { archiveReportInputSchema, type ArchiveReportInput } from '../schemas'
import { periodFromBounds } from '../lib/period'
import { getAnalyticsReport } from '../lib/report-data'
import { buildFallbackNarrative, getNarrative } from '../lib/narrative'

/**
 * Writes the currently displayed period into the report archive, exactly as
 * shown: the same stored-table data and the same narrative. Rows are keyed by
 * (client, platform, period), so re-exporting a period updates it in place.
 */
export async function archiveReport(input: ArchiveReportInput): Promise<ActionResult> {
  const parsed = archiveReportInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid archive request' }

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
  const timezone = agency?.timezone ?? 'UTC'
  const period = periodFromBounds(preset, start, end)

  const report = await getAnalyticsReport(clientId, period, timezone)
  if (!report.hasHistory) {
    return { ok: false, error: 'Nothing to export yet — the first sync runs tonight' }
  }
  const narrative =
    (await getNarrative(clientId, client.name, period, timezone, report.lastSyncAt)) ??
    buildFallbackNarrative(report) ??
    ''

  const { error } = await supabase.from('analytics_reports').upsert(
    {
      client_id: clientId,
      platform: 'instagram',
      period_start: period.start,
      period_end: period.end,
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
