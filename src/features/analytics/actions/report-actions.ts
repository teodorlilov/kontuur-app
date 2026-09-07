'use server'

import { revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchClientWithOwnership, resolveActionAuth } from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'
import type { Json } from '@/types'
import { getCachedAgency } from '@/lib/queries/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchConnection, fetchConnectionSyncState, fetchIgConnectionState } from '@/lib/queries/db'
import { GraphApiError } from '@/lib/meta/graph-errors'
import { isTokenExpired } from '@/lib/meta/token-expiry'
import { toDateKey } from '@/utils/date-helpers'
import { archiveReportInputSchema, type ArchiveReportInput } from '../schemas'
import { periodFromBounds, type AnalyticsPeriod } from '../lib/compute/period'
import { getAnalyticsReport, IG_METRICS_TAG } from '../lib/instagram/report-data'
import { FB_METRICS_TAG, getFacebookAnalyticsReport } from '../lib/facebook/facebook-report-data'
import {
  buildFacebookFallbackNarrative,
  getFacebookNarrative,
} from '../lib/facebook/facebook-narrative'
import { fillPageWindow } from '../lib/facebook/sync-facebook-metrics'
import type { FacebookReportData } from '../lib/facebook/build-facebook-report'
import { refreshWindowMetrics } from '../lib/instagram/refresh-window'
import { syncDemographicsWeekly } from '../lib/instagram/sync-metrics'
import { buildFallbackNarrative, getNarrative } from '../lib/instagram/narrative'
import type { AnalyticsReportData } from '../lib/instagram/build-report'

interface ReportScope {
  client: { id: string; name: string }
  timezone: string
  period: AnalyticsPeriod
  /** Parsed, defaulted — never read off the raw input. */
  network: 'instagram' | 'facebook'
  supabase: SupabaseClient
}

/**
 * The client's Instagram credentials, or null when there is nothing usable to call Meta with.
 *
 * Reads through `scope.supabase`, the caller's RLS-scoped client, not the admin key: this is a
 * user-initiated action and the row it fetches should be one the caller can already see. The
 * Facebook branch of `fillPeriodData` below uses the admin client for the same query, which is
 * a difference to preserve deliberately rather than harmonise by reflex.
 *
 * A failed read returns null rather than throwing. Both callers treat "no usable connection" as a
 * stalled-but-fine outcome and return `ok: true` on it — the page has already rendered from stored
 * data — and a lookup that errored is no more usable than one that found nothing.
 */
async function usableIgCredentials(
  scope: ReportScope
): Promise<{ accountId: string; accessToken: string } | null> {
  let connection
  try {
    connection = await fetchConnection(scope.supabase, scope.client.id, 'instagram')
  } catch (err) {
    console.error('[analytics] instagram connection lookup failed', {
      clientId: scope.client.id,
      err,
    })
    return null
  }
  if (
    !connection?.account_id ||
    !connection.access_token ||
    isTokenExpired(connection.token_expires_at)
  ) {
    return null
  }
  return { accountId: connection.account_id, accessToken: connection.access_token }
}

async function resolveReportScope(
  input: ArchiveReportInput
): Promise<{ ok: true; scope: ReportScope } | { ok: false; error: string }> {
  const parsed = archiveReportInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid report request' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const { clientId, preset, start, end, network } = parsed.data
  const client = await fetchClientWithOwnership(supabase, clientId, agencyId)
  if (!client) return { ok: false, error: 'Not found' }

  const agency = await getCachedAgency(agencyId)
  return {
    ok: true,
    scope: {
      client: { id: client.id, name: client.name },
      timezone: agency?.timezone ?? 'UTC',
      period: periodFromBounds(preset, start, end),
      network,
      supabase,
    },
  }
}

/**
 * The one write both networks share: the shown period stored under the account and platform it
 * describes.
 *
 * WHY as: the report is stringified and re-parsed so what reaches the jsonb column is plain
 * JSON, and `JSON.parse` answers `any` — the assertion names the column's type. The report
 * cannot simply be assigned to `Json` instead: `Json`'s object member is an index-signature
 * type, and the report interfaces have no index signature.
 */
async function upsertReportRow(
  scope: ReportScope,
  accountId: string,
  platform: 'instagram' | 'facebook',
  report: AnalyticsReportData | FacebookReportData,
  narrative: string
): Promise<ActionResult> {
  const { error } = await scope.supabase.from('analytics_reports').upsert(
    {
      client_id: scope.client.id,
      platform_account_id: accountId,
      platform,
      period_start: scope.period.start,
      period_end: scope.period.end,
      metrics_json: JSON.parse(JSON.stringify(report)) as Json,
      ai_summary: narrative,
    },
    { onConflict: 'client_id,platform_account_id,platform,period_start,period_end' }
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: undefined }
}

/**
 * Writes the currently displayed period into the report archive exactly as shown — the same
 * stored-table data and the same narrative the reader is looking at, never a fresh pull.
 *
 * Both branches refuse without a connected account, because the row is stamped with the account
 * it describes and `fetchReportArchive` filters on `platform_account_id`: an unstamped row would
 * be invisible to the very list that offers it.
 *
 * A branch per network rather than one body with holes: the reader, the narrative source and the
 * report shape all differ, and only the row write is common — which is why that, and only that,
 * is `upsertReportRow`.
 */
export async function archiveReport(input: ArchiveReportInput): Promise<ActionResult> {
  const resolved = await resolveReportScope(input)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved

  if (scope.network === 'facebook') {
    const { accountId } = await fetchConnectionSyncState(
      scope.supabase,
      scope.client.id,
      'facebook'
    )
    if (!accountId) {
      return { ok: false, error: 'Connect Facebook before exporting a report' }
    }
    const report = await getFacebookAnalyticsReport(scope.client.id, scope.period, scope.timezone)
    if (!report.hasHistory) {
      return { ok: false, error: 'Nothing to export yet — the first sync runs tonight' }
    }
    const narrative =
      (
        await getFacebookNarrative(
          scope.client.id,
          scope.client.name,
          scope.period,
          scope.timezone,
          report.lastSyncAt
        )
      )?.text ??
      buildFacebookFallbackNarrative(report) ??
      ''
    return upsertReportRow(scope, accountId, 'facebook', report, narrative)
  }

  const { accountId } = await fetchIgConnectionState(scope.supabase, scope.client.id)
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
  return upsertReportRow(scope, accountId, 'instagram', report, narrative)
}

/** What one fill run achieved — enough for `AutoFill` to know whether to wait. */
interface FillOutcome {
  /** Days were written; the page is worth re-rendering. */
  filled: boolean
  /** Nothing landed and re-running will not help right now — the chain stops and says so. */
  stalled: boolean
  rateLimited?: boolean
}

/**
 * The automatic period fill: `AutoFill` mounts when the window has days never asked of Meta and
 * calls this once per (window, unfilled-count), so completed runs chain and a run that moves
 * nothing terminates the chain. It only completes the stored data and busts the caches —
 * archived reports and narratives are never rewritten.
 *
 * Repeat calls are cheap by construction, because a day marked "asked" is never re-asked:
 * Instagram's `selectRefillDays` skips them and Facebook's fill drops a chunk whose every day is
 * marked before spending a call on it. A run that throws still answers `ok` — the page has
 * already rendered from stored data.
 *
 * The network decides the fill's shape. Instagram walks days; Facebook's is a ranged fetch, so a
 * 90-day chunk costs the same five calls (one per `PAGE_DAY_METRICS` entry) a single night does.
 * It is handed BOTH windows, because the Facebook reader selects rows from `prevStart` and builds
 * every "then" number out of them, and an end clamped to today, because a period arriving at this
 * action — unlike one `resolvePeriod` produced — can still end in the future.
 */
export async function fillPeriodData(
  input: ArchiveReportInput
): Promise<ActionResult<FillOutcome>> {
  const resolved = await resolveReportScope(input)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved
  const admin = createAdminSupabaseClient()

  if (scope.network === 'facebook') {
    const connection = await fetchConnection(admin, scope.client.id, 'facebook')
    if (!connection?.access_token || isTokenExpired(connection.token_expires_at)) {
      return { ok: true, data: { filled: false, stalled: true } }
    }
    try {
      const today = toDateKey(new Date(), scope.timezone)
      const outcome = await fillPageWindow(admin, {
        clientId: scope.client.id,
        pageId: connection.account_id,
        accessToken: connection.access_token,
        fromDate: scope.period.prevStart,
        toDate: scope.period.end < today ? scope.period.end : today,
      })
      revalidateTag(FB_METRICS_TAG, 'max')
      return { ok: true, data: { filled: outcome.wroteDays > 0, stalled: outcome.wroteDays === 0 } }
    } catch (err) {
      console.error('[analytics] facebook period fill failed', { clientId: scope.client.id, err })
      return {
        ok: true,
        data: {
          filled: false,
          stalled: true,
          rateLimited: err instanceof GraphApiError && err.failure === 'rate_limited',
        },
      }
    }
  }

  const credentials = await usableIgCredentials(scope)
  if (!credentials) return { ok: true, data: { filled: false, stalled: true } }

  let outcome
  try {
    outcome = await refreshWindowMetrics(
      admin,
      {
        clientId: scope.client.id,
        accountId: credentials.accountId,
        accessToken: credentials.accessToken,
      },
      scope.period,
      toDateKey(new Date(), scope.timezone)
    )
  } catch (err) {
    console.error('[analytics] automatic period fill failed', { clientId: scope.client.id, err })
    return { ok: true, data: { filled: false, stalled: true } }
  }

  revalidateTag(IG_METRICS_TAG, 'max')
  return {
    ok: true,
    data: {
      filled: outcome.refilledDays > 0,
      stalled: outcome.refilledDays === 0 && (outcome.rateLimited || outcome.failedDays > 0),
      rateLimited: outcome.rateLimited,
    },
  }
}

/**
 * Captures the audience snapshot on demand — the one section a period fill cannot produce. The
 * window refill only asks for days and stops once every day is marked, so an account whose
 * nightly sync has not written a snapshot would otherwise sit on "no snapshot exists" forever.
 * `syncDemographicsWeekly` is cadence-gated per account, so a repeat call is one lookup, and a
 * capture that throws still answers `ok` — the rest of the page is already rendered.
 *
 * It refuses a Facebook request rather than ignoring the field: everything below is the
 * Instagram connection, Instagram demographics and IG_METRICS_TAG, and Meta serves no
 * equivalent for Pages (`page_fans_country` answers 400 — docs/META-FB-PROBE.md:645).
 */
export async function ensureAudienceSnapshot(
  input: ArchiveReportInput
): Promise<ActionResult<{ captured: boolean }>> {
  const resolved = await resolveReportScope(input)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { scope } = resolved
  if (scope.network !== 'instagram') {
    return { ok: false, error: 'Audience demographics are an Instagram-only capability' }
  }

  const credentials = await usableIgCredentials(scope)
  if (!credentials) return { ok: true, data: { captured: false } }

  try {
    await syncDemographicsWeekly(
      createAdminSupabaseClient(),
      scope.client.id,
      credentials.accountId,
      credentials.accessToken
    )
  } catch (err) {
    console.error('[analytics] audience snapshot capture failed', {
      clientId: scope.client.id,
      err,
    })
    return { ok: true, data: { captured: false } }
  }

  revalidateTag(IG_METRICS_TAG, 'max')
  return { ok: true, data: { captured: true } }
}

/**
 * Removes one archived report, after proving it belongs to the caller's agency.
 *
 * No `revalidateTag`: `fetchReportArchive` is an uncached read the page makes on every render,
 * and `ArchiveRowDelete` refreshes the route once this returns.
 */
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

  return { ok: true, data: undefined }
}
