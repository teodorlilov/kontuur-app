import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchAccountFields,
  fetchDailyReachSeries,
  fetchDayTotals,
  fetchDemographics,
  fetchFollowsBreakdown,
  fetchInteractionsByProductType,
  fetchLinkTaps,
  fetchManyMediaInsights,
  fetchMediaSince,
  fetchReachByProductType,
  type IGDemographics,
} from '@/lib/meta/instagram/insights'
import { PLATFORM_NAMES } from '@/lib/validation'
import {
  runSyncPhases,
  syncRoster,
  type MetricsSyncOutcome,
  type SyncPhase,
} from '../shared/sync-shared'
import { fetchPostIdsByMediaId } from '@/lib/queries/posts-by-media-id'
import type { SyncableConnection } from '@/lib/queries/select-columns'
import { MS_PER_DAY, SECONDS_PER_DAY } from '@/utils/constants'
import { dayKeyToUnixSeconds, shiftDateKey } from '@/utils/date-helpers'
import { captureAndDeriveBestTime, ONLINE_FOLLOWERS_BACKFILL_DAYS } from './online-followers'
import {
  toReachRows,
  upsertAccountMetricDays,
  type IGAccountMetricsInsert,
} from './account-metrics-store'
import { upsertPostMetricRows, type PlatformPostMetricsInsert } from '../shared/post-metrics-store'

/**
 * The nightly Instagram metrics capture. One rule governs every write: NULL
 * means "the API had nothing" and 0 means the API said 0 — the probe's core
 * lesson (silent-empty HTTP 200s are the Graph API's failure mode), and the
 * reason every metric column in the 20260822 tables is nullable.
 */

const DEMOGRAPHICS_REFRESH_DAYS = 7
const BACKFILL_DAYS = 30
const MEDIA_LOOKBACK_DAYS = 30
/**
 * Meta keeps consolidating a day's numbers after it ends (late-counted views,
 * spam removal). Each night the sync re-captures this many finished days, so
 * every stored day converges to Instagram's own value during the week it
 * matters — the cure for "our July 28th disagrees with the IG app".
 */
const CONSOLIDATION_DAYS = 7

/**
 * Syncs yesterday's account metrics, per-post insights and (weekly)
 * demographics for every client with a live Instagram connection. Per-client
 * failures are contained: dead tokens notify the agency and move on, one
 * rate-limit answer stops the whole run (tomorrow retries), anything else
 * skips just that client.
 */
export async function syncAllClientMetrics(
  admin: SupabaseClient,
  { timeBudgetMs }: { timeBudgetMs: number }
): Promise<MetricsSyncOutcome> {
  return syncRoster(admin, {
    platform: 'instagram',
    networkLabel: PLATFORM_NAMES.instagram,
    timeBudgetMs,
    syncOne: (connection) => syncClientMetrics(admin, connection),
  })
}

/**
 * One client's nightly capture, phase by phase — each isolated.
 *
 * These used to run as a single chain, so ONE flaky call anywhere upstream
 * cost every later phase its writes. That is how an account with a firing
 * cron and a valid token still showed an empty audience section for days:
 * demographics run last, and the run never got there. Now a narrow failure is
 * recorded and the next phase still runs; only account-wide conditions abort.
 * The aggregate throw at the end keeps the failure VISIBLE in the cron's
 * per-client errors — silence is what let this hide.
 */
async function syncClientMetrics(
  admin: SupabaseClient,
  // The caller has already skipped connections with no client, so the guarantee travels in the
  // type rather than being re-tested here.
  connection: SyncableConnection & { client_id: string }
): Promise<void> {
  const { client_id: clientId, account_id: accountId, access_token: accessToken } = connection
  // Read the history flag BEFORE writing yesterday's row, or it is never zero.
  // Scoped to THIS account: after a reconnect the new account has no history
  // and must get its own backfill, whatever the old account left behind.
  const hadHistory = await hasAccountHistory(admin, clientId, accountId)

  const phases: SyncPhase[] = [
    { name: 'day totals', run: () => syncAccountDay(admin, clientId, accountId, accessToken) },
    {
      name: hadHistory ? 'consolidation recapture' : 'history backfill',
      run: () =>
        hadHistory
          ? recaptureConsolidatingDays(admin, clientId, accountId, accessToken)
          : backfillAccountHistory(admin, clientId, accountId, accessToken),
    },
    { name: 'post metrics', run: () => syncPostMetrics(admin, clientId, accountId, accessToken) },
    {
      name: 'demographics',
      run: () => syncDemographicsWeekly(admin, clientId, accountId, accessToken),
    },
    {
      name: 'online hours',
      /**
       * An account with no history asks for the whole window at once, not four days.
       *
       * Nothing used to backfill this column, so a new client gained one day per night and waited
       * about three weeks for a usable grid — while `refreshWindowMetrics` was already proving Meta
       * serves ninety days on request. An established account reaches the threshold on its first
       * night now. An account that already has history keeps the short trailing window, which is all
       * the consolidation lag needs.
       */
      run: async () => {
        await captureAndDeriveBestTime(
          admin,
          { clientId, accountId, accessToken },
          hadHistory ? ONLINE_FOLLOWERS_LOOKBACK_DAYS : ONLINE_FOLLOWERS_BACKFILL_DAYS
        )
      },
    },
  ]

  const failures = await runSyncPhases(phases)
  if (failures.length > 0) {
    throw new Error(
      `partial sync (${failures.length} of ${phases.length} phases) — ${failures.join(' | ')}`
    )
  }
}

/**
 * Meta serves empty maps for the freshest day or two, so each night re-asks a
 * short trailing window and keeps whatever has consolidated since.
 */
const ONLINE_FOLLOWERS_LOOKBACK_DAYS = 4

/**
 * One finished day's full capture — the totals pair plus the four rendered
 * breakdowns. Shared by the nightly sync (yesterday + the consolidation
 * window) and the analytics window refill.
 *
 * interactions_by_media_product_type belongs here beside its denominator.
 * When only syncAccountDay fetched it, one day in thirty-five carried it
 * while every day carried reach_by_media_product_type — so the formats
 * section divided a single day's interactions by a whole window's reach and
 * called the result an engagement rate. A breakdown and the reach it is
 * rated against must be captured by the same call, or the ratio is fiction.
 */
export async function captureDayTotals(
  clientId: string,
  accountId: string,
  accessToken: string,
  dateKey: string
): Promise<IGAccountMetricsInsert> {
  const sinceTs = dayKeyToUnixSeconds(dateKey)
  const untilTs = sinceTs + SECONDS_PER_DAY
  const [totals, followsSplit, linkTaps, reachByType, interactionsByType] = await Promise.all([
    fetchDayTotals(accountId, accessToken, sinceTs, untilTs),
    fetchFollowsBreakdown(accountId, accessToken, sinceTs, untilTs),
    fetchLinkTaps(accountId, accessToken, sinceTs, untilTs),
    fetchReachByProductType(accountId, accessToken, sinceTs, untilTs),
    fetchInteractionsByProductType(accountId, accessToken, sinceTs, untilTs),
  ])
  return {
    client_id: clientId,
    ig_account_id: accountId,
    metric_date: dateKey,
    views: totals.views,
    accounts_engaged: totals.accounts_engaged,
    total_interactions: totals.total_interactions,
    likes: totals.likes,
    comments: totals.comments,
    saves: totals.saves,
    shares: totals.shares,
    replies: totals.replies,
    reposts: totals.reposts,
    profile_views: totals.profile_views,
    website_clicks: totals.website_clicks,
    follows: followsSplit.follows,
    unfollows: followsSplit.unfollows,
    profile_links_taps: linkTaps.total,
    link_taps_by_button_type: linkTaps.byButton,
    reach_by_media_product_type: reachByType,
    interactions_by_media_product_type: interactionsByType,
    // Asked, whatever came back — the refill never re-spends on this day.
    totals_synced_at: new Date().toISOString(),
  }
}

/**
 * The days a nightly run re-asks, newest first, plus the oldest of them.
 * Yesterday is NOT among them — syncAccountDay has just written it in full —
 * so the window is days 2..CONSOLIDATION_DAYS back.
 */
export function consolidationWindow(yesterday: string): { dayKeys: string[]; oldest: string } {
  const dayKeys = Array.from({ length: CONSOLIDATION_DAYS - 1 }, (_, index) =>
    shiftDateKey(yesterday, -(index + 1))
  )
  return { dayKeys, oldest: dayKeys[dayKeys.length - 1] ?? yesterday }
}

/**
 * Re-captures days 2..N back so stored values track Meta's consolidation.
 *
 * Reach rides along in its OWN batch rather than inside captureDayTotals. It is
 * a series metric — one call covers the whole window, where the totals cost one
 * call per day — and it must never be written as an explicit NULL for a day the
 * series skipped, which a shared row shape would force. Leaving it out entirely
 * was the older bug: the headline number of the whole document, and the one the
 * "our 28 July disagrees with the app" complaint was about, was the only metric
 * the consolidation window never revisited.
 *
 * followers_count deliberately stays out: it is a reading of the account taken
 * now, so there is no past value to re-ask for.
 */
async function recaptureConsolidatingDays(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const { date: yesterday } = yesterdayUtcWindow()
  const { dayKeys, oldest } = consolidationWindow(yesterday)
  const rows: IGAccountMetricsInsert[] = []
  for (const dateKey of dayKeys) {
    rows.push(await captureDayTotals(clientId, accountId, accessToken, dateKey))
  }
  await upsertAccountMetricDays(admin, rows, 'consolidation recapture')

  // Yesterday is excluded: syncAccountDay wrote its reach minutes ago.
  const reachSeries = await fetchDailyReachSeries(
    accountId,
    accessToken,
    dayKeyToUnixSeconds(oldest),
    dayKeyToUnixSeconds(yesterday)
  )
  await upsertAccountMetricDays(
    admin,
    toReachRows(clientId, accountId, reachSeries),
    'consolidation reach'
  )
}

async function hasAccountHistory(
  admin: SupabaseClient,
  clientId: string,
  accountId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from('ig_account_metrics')
    .select('id')
    .eq('client_id', clientId)
    .eq('ig_account_id', accountId)
    .limit(1)
  if (error) throw new Error(`ig_account_metrics lookup failed: ${error.message}`)
  return (data ?? []).length > 0
}

/** Yesterday as a UTC calendar day: its date label and [start, end) unix bounds. */
function yesterdayUtcWindow(): { date: string; sinceTs: number; untilTs: number } {
  const todayStartMs = new Date().setUTCHours(0, 0, 0, 0)
  const startMs = todayStartMs - MS_PER_DAY
  return {
    date: new Date(startMs).toISOString().slice(0, 10),
    sinceTs: Math.floor(startMs / 1000),
    untilTs: Math.floor(todayStartMs / 1000),
  }
}

/** Writes yesterday's full account row — seven independent fetches in parallel. */
async function syncAccountDay(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const window = yesterdayUtcWindow()
  const [account, reachSeries, dayTotals] = await Promise.all([
    fetchAccountFields(accountId, accessToken),
    fetchDailyReachSeries(accountId, accessToken, window.sinceTs, window.untilTs),
    // The same capture the consolidation recapture and the analytics refill use. Eighteen columns
    // were written here from a second literal that duplicated it field for field — identical
    // values, two places to change, and `follows`/`unfollows` among them.
    captureDayTotals(clientId, accountId, accessToken, window.date),
  ])

  const row: IGAccountMetricsInsert = {
    ...dayTotals,
    // The three the nightly run alone can see: an account snapshot is a NOW reading, not a day's
    // history, so no per-day capture can produce it.
    followers_count: account.followers_count,
    follows_count: account.follows_count,
    media_count: account.media_count,
    // Summed from the series rather than taken per day. An empty series is the API's silent-empty —
    // null, never 0.
    reach: reachSeries.length > 0 ? reachSeries.reduce((sum, day) => sum + day.reach, 0) : null,
  }
  await upsertAccountMetricDays(admin, [row], 'day totals')
}

/**
 * First sync only: seed the trailing 30 days with what the API can still serve
 * per-day — reach and the new-follower delta. Every other column stays NULL;
 * historical day totals are not reconstructable. Yesterday already has its full
 * row, so it is excluded, and ignoreDuplicates keeps this from ever downgrading
 * a richer row in a race.
 */
async function backfillAccountHistory(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const window = yesterdayUtcWindow()
  const sinceTs = window.untilTs - BACKFILL_DAYS * SECONDS_PER_DAY
  const reachSeries = await fetchDailyReachSeries(accountId, accessToken, sinceTs, window.untilTs)

  // Uniform keys per row — PostgREST rejects ragged bulk inserts.
  const byDate = new Map<string, IGAccountMetricsInsert>()
  const rowFor = (date: string): IGAccountMetricsInsert => {
    let row = byDate.get(date)
    if (!row) {
      row = {
        client_id: clientId,
        ig_account_id: accountId,
        metric_date: date,
        reach: null,
      }
      byDate.set(date, row)
    }
    return row
  }
  for (const day of reachSeries) rowFor(day.date).reach = day.reach
  byDate.delete(window.date)
  if (byDate.size === 0) return

  // ignoreDuplicates: a first sync must not overwrite a day another pass already captured in full.
  await upsertAccountMetricDays(admin, [...byDate.values()], 'backfill', { ignoreDuplicates: true })
}

/**
 * Refreshes lifetime insights for media since `sinceIso` (the nightly default
 * is 30 days; the analytics window refresh passes the selected period's start)
 * and links them to Postflow posts.
 */
export async function syncPostMetrics(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string,
  sinceIso: string = new Date(Date.now() - MEDIA_LOOKBACK_DAYS * MS_PER_DAY).toISOString()
): Promise<void> {
  const media = await fetchMediaSince(accountId, accessToken, sinceIso)
  if (media.length === 0) return

  const [insightsList, postIdByMediaId] = await Promise.all([
    fetchManyMediaInsights(
      media.map((item) => item.id),
      accessToken
    ),
    fetchPostIdsByMediaId(
      admin,
      clientId,
      media.map((item) => item.id)
    ),
  ])

  const now = new Date().toISOString()
  const rows: PlatformPostMetricsInsert[] = media.map((item, index) => {
    const insights = insightsList[index]!
    return {
      client_id: clientId,
      // The nightly measurement is Instagram's; the table it writes now holds both networks.
      platform: 'instagram',
      platform_account_id: accountId,
      post_id: postIdByMediaId.get(item.id) ?? null,
      external_post_id: item.id,
      media_type: item.media_type ?? null,
      media_product_type: item.media_product_type ?? null,
      permalink: item.permalink ?? null,
      // thumbnail_url is video-only on /media; the image itself fills in elsewhere.
      thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
      caption: item.caption ?? null,
      posted_at: item.timestamp ?? null,
      reach: insights.reach,
      views: insights.views,
      like_count: item.like_count ?? null,
      comments_count: item.comments_count ?? null,
      saved: insights.saved,
      shares: insights.shares,
      total_interactions: insights.total_interactions,
      follows: insights.follows,
      profile_visits: insights.profile_visits,
      last_synced_at: now,
    }
  })

  await upsertPostMetricRows(admin, rows, 'post insights')
}

/**
 * At most one demographics snapshot per week — eight breakdown calls are not
 * free. Shared with the on-demand refill: the audience section is the one
 * panel a period filter cannot compute from day rows, so the refill asks for
 * a snapshot too rather than leaving the section empty until tonight.
 */
export async function syncDemographicsWeekly(
  admin: SupabaseClient,
  clientId: string,
  accountId: string,
  accessToken: string
): Promise<void> {
  const cutoff = new Date(Date.now() - DEMOGRAPHICS_REFRESH_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
  const { data, error } = await admin
    .from('ig_audience_snapshots')
    .select('id')
    .eq('client_id', clientId)
    // Account-scoped: a freshly connected account earns its own first snapshot
    // regardless of what the previous account's cadence left behind.
    .eq('ig_account_id', accountId)
    .gte('snapshot_date', cutoff)
    .limit(1)
  if (error) throw new Error(`ig_audience_snapshots lookup failed: ${error.message}`)
  if ((data ?? []).length > 0) return

  const [follower, engaged] = await Promise.all([
    fetchDemographics(accountId, accessToken, 'follower_demographics'),
    fetchDemographics(accountId, accessToken, 'engaged_audience_demographics'),
  ])

  // A both-NULL row is still written: it records "checked, the API had nothing"
  // and spaces the eight-call probe to weekly for under-floor accounts.
  const row: {
    client_id: string
    ig_account_id: string
    snapshot_date: string
    follower_demographics: IGDemographics | null
    engaged_audience_demographics: IGDemographics | null
  } = {
    client_id: clientId,
    ig_account_id: accountId,
    snapshot_date: new Date().toISOString().slice(0, 10),
    follower_demographics: follower,
    engaged_audience_demographics: engaged,
  }
  const { error: upsertError } = await admin
    .from('ig_audience_snapshots')
    .upsert(row, { onConflict: 'client_id,ig_account_id,snapshot_date' })
  if (upsertError) throw new Error(`ig_audience_snapshots upsert failed: ${upsertError.message}`)
}
