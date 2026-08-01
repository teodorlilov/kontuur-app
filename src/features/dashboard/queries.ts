import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedPendingRows, SCHEDULED_STATUSES, type PendingRow } from '@/lib/queries/cache'
import { BRIEFING_COLUMNS } from '@/lib/queries/select-columns'
import { getMonthBoundaries, getWeekRange } from '@/utils/date-helpers'
import { fetchImagesByPost } from '@/features/publishing/lib/fetch-post-images'
import type { CarouselSlide, DashboardChangeRequest } from '@/types/api'

// Supabase REST returns untyped rows for embedded/joined selects, so each result
// below is narrowed with an `as` to the shape its select string produces.

export interface DashboardBriefing {
  briefing_text: string | null
  action_nudge: string | null
  weekly_tip: string | null
  platform_updates: string[] | null
  week_start: string | null
  coaching_points: string[] | null
}

export interface PendingPostPreview {
  id: string
  caption: string
  platform: string
  pillar: string
  createdAt: string
  clientName: string
  imageUrl: string | null
}

export interface DashboardMetrics {
  /** null means the query failed — the dashboard must not render that as 0. */
  scheduledThisWeek: number | null
  pendingCount: number
  /** Oldest pending post's created_at, or null when the queue is empty. */
  oldestPendingAt: string | null
  clientPendingMap: Record<string, number>
  clientsAddedThisMonth: number
  connectedClientCount: number
}

/** A publish the cron will attempt, soonest first. */
export interface UpcomingPublish {
  id: string
  clientName: string
  platform: string
  scheduledAt: string
}

/** A publish the cron already attempted and lost. */
export interface FailedPublish {
  id: string
  clientName: string
  platform: string
  scheduledAt: string | null
}

export interface DashboardData {
  metrics: DashboardMetrics
  briefing: DashboardBriefing | null
  pendingPosts: PendingPostPreview[]
  changeRequests: DashboardChangeRequest[]
  upcomingPublishes: UpcomingPublish[]
  failedPublishes: FailedPublish[]
}

interface ChangeRequestRow {
  id: string
  client_id: string
  caption: string | null
  platform: string | null
  post_type: string
  slides_json: unknown
  scheduled_at: string | null
  post_approval_tokens: Array<{
    status: string
    client_note: string | null
    responded_at: string | null
    batch_id: string
  }>
}

interface PendingPostRow {
  id: string
  caption: string
  platform: string
  pillar: string | null
  created_at: string
  client_id: string
}

interface PublishRow {
  id: string
  client_id: string
  platform: string | null
  scheduled_at: string | null
}

interface ClientSummary {
  id: string
  name: string
  created_at: string | null
}

/** The dashboard queue scrolls, so it holds more than a glance's worth. */
const PENDING_PREVIEW_LIMIT = 12
const CHANGE_REQUEST_LIMIT = 5
/** At 3–8 publishes a day, three rows answer "what's next" without becoming a feed. */
const PUBLISH_PREVIEW_LIMIT = 3

interface QueryOutcome {
  error: { message: string } | null
}

/**
 * A failed count is not zero, so a failed query returns null and the card
 * renders an explicit unknown. Returning 0 here would have presented an outage
 * as a real figure — the exact thing the log line was meant to prevent.
 */
function readCount(
  result: QueryOutcome & { count: number | null },
  label: string
): number | null {
  if (result.error) {
    console.error(`[dashboard] ${label} count failed:`, result.error.message)
    return null
  }
  return result.count ?? 0
}

/** Same contract for the list queries, which degrade to an empty section. */
function logIfFailed(result: QueryOutcome, label: string): void {
  if (result.error) console.error(`[dashboard] ${label} query failed:`, result.error.message)
}

/** Fetch all tokens in the given batches and return a map of postId → 1-indexed position. */
async function fetchBatchPositions(
  supabase: SupabaseClient,
  batchIds: string[]
): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map()

  const { data } = await supabase
    .from('post_approval_tokens')
    .select('batch_id, post_id')
    .in('batch_id', batchIds)
    .order('created_at', { ascending: true })

  const batchOrder = new Map<string, string[]>()
  for (const token of (data as Array<{ batch_id: string | null; post_id: string | null }> | null) ?? []) {
    if (!token.batch_id || !token.post_id) continue
    const ids = batchOrder.get(token.batch_id) ?? []
    ids.push(token.post_id)
    batchOrder.set(token.batch_id, ids)
  }

  const positions = new Map<string, number>()
  for (const [, postIds] of batchOrder) {
    postIds.forEach((postId, index) => positions.set(postId, index + 1))
  }
  return positions
}

/** Map raw change-request rows to the view model, resolving each post's place in its batch. */
async function buildChangeRequests(
  supabase: SupabaseClient,
  rows: ChangeRequestRow[],
  clientNames: Map<string, string>
): Promise<DashboardChangeRequest[]> {
  if (rows.length === 0) return []

  const batchIds = [
    ...new Set(rows.flatMap((row) => row.post_approval_tokens.map((token) => token.batch_id)).filter(Boolean)),
  ]
  const positions = await fetchBatchPositions(supabase, batchIds)

  return rows.map((row) => {
    const token = row.post_approval_tokens[0]!
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: clientNames.get(row.client_id) ?? 'Unknown',
      caption: row.caption,
      platform: row.platform,
      postType: row.post_type,
      slidesJson: row.slides_json as CarouselSlide[] | null,
      scheduledAt: row.scheduled_at,
      clientNote: token.client_note,
      respondedAt: token.responded_at,
      postNumber: positions.get(row.id) ?? 1,
    }
  })
}

/** Per-client pending tally plus the oldest waiting draft. */
function summarisePending(rows: PendingRow[]): {
  clientPendingMap: Record<string, number>
  oldestPendingAt: string | null
} {
  const clientPendingMap: Record<string, number> = {}
  let oldestPendingAt: string | null = null

  for (const row of rows) {
    clientPendingMap[row.client_id] = (clientPendingMap[row.client_id] ?? 0) + 1
    if (!oldestPendingAt || row.created_at < oldestPendingAt) oldestPendingAt = row.created_at
  }

  return { clientPendingMap, oldestPendingAt }
}

/**
 * Everything the dashboard renders, in one parallel round-trip.
 * Every figure is measured — nothing on the dashboard is a fixed string.
 */
export async function fetchDashboardData(
  supabase: SupabaseClient,
  agencyId: string,
  clients: ClientSummary[],
  weekStartISO: string,
  timeZone: string
): Promise<DashboardData> {
  const clientIds = clients.map((client) => client.id)
  const clientNames = new Map(clients.map((client) => [client.id, client.name]))

  // Every boundary below is the agency's, not the server's — the same range the
  // coverage grid is built from, so the two halves of a card always agree.
  const { monthStart } = getMonthBoundaries(timeZone)
  const { from: weekStart, to: weekEnd } = getWeekRange(weekStartISO, timeZone)
  const nowISO = new Date().toISOString()

  const clientsAddedThisMonth = clients.filter(
    (client) => client.created_at !== null && client.created_at >= monthStart
  ).length

  if (clientIds.length === 0) {
    return {
      metrics: {
        scheduledThisWeek: 0,
        pendingCount: 0,
        oldestPendingAt: null,
        clientPendingMap: {},
        clientsAddedThisMonth,
        connectedClientCount: 0,
      },
      briefing: null,
      pendingPosts: [],
      changeRequests: [],
      upcomingPublishes: [],
      failedPublishes: [],
    }
  }

  const [
    scheduledRes,
    upcomingRes,
    failedRes,
    pendingRows,
    connectionsRes,
    briefingRes,
    pendingPostsRes,
    changeRequestsRes,
  ] = await Promise.all([
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      // Bounded at both ends: .gte alone counted every future post ever
      // scheduled, under a label that says "this week".
      .in('status', SCHEDULED_STATUSES)
      .gte('scheduled_at', weekStart)
      .lt('scheduled_at', weekEnd)
      .in('client_id', clientIds),
    // What the cron will attempt next. Unbounded forward on purpose — the
    // question is "what is next", not "what is next inside this week".
    supabase
      .from('posts')
      .select('id, client_id, platform, scheduled_at')
      .in('status', SCHEDULED_STATUSES)
      .gte('scheduled_at', nowISO)
      .in('client_id', clientIds)
      .order('scheduled_at', { ascending: true })
      .limit(PUBLISH_PREVIEW_LIMIT),
    // What the cron already lost. Newest first: a stale failure matters less
    // than one from last night.
    supabase
      .from('posts')
      .select('id, client_id, platform, scheduled_at')
      .eq('status', 'failed')
      .in('client_id', clientIds)
      .order('scheduled_at', { ascending: false })
      .limit(PUBLISH_PREVIEW_LIMIT),
    getCachedPendingRows(agencyId),
    supabase.from('social_connections').select('client_id').in('client_id', clientIds),
    supabase
      .from('intelligence_briefings')
      .select(BRIEFING_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('posts')
      .select('id, caption, platform, pillar, created_at, client_id')
      .in('client_id', clientIds)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(PENDING_PREVIEW_LIMIT),
    supabase
      .from('posts')
      .select(
        'id, client_id, caption, platform, post_type, slides_json, scheduled_at, post_approval_tokens!inner(status, client_note, responded_at, batch_id)'
      )
      .in('client_id', clientIds)
      .eq('post_approval_tokens.status', 'changes_requested')
      .order('scheduled_at', { ascending: false })
      .limit(CHANGE_REQUEST_LIMIT),
  ])

  logIfFailed(connectionsRes, 'connections')
  logIfFailed(briefingRes, 'briefing')
  logIfFailed(pendingPostsRes, 'pending posts')
  logIfFailed(changeRequestsRes, 'change requests')
  logIfFailed(upcomingRes, 'upcoming publishes')
  logIfFailed(failedRes, 'failed publishes')

  const { clientPendingMap, oldestPendingAt } = summarisePending(pendingRows)
  const connectedClients = new Set(
    ((connectionsRes.data as Array<{ client_id: string | null }> | null) ?? [])
      .map((row) => row.client_id)
      .filter((id): id is string => id !== null)
  )

  const pendingPostRows = (pendingPostsRes.data as PendingPostRow[] | null) ?? []

  // Neither depends on the other, so they share a wave rather than queueing —
  // both only needed the ids the batch above already returned.
  const [imagesByPost, changeRequests] = await Promise.all([
    // Admin-client read: post_images RLS blocks the user-scoped client. Safe here
    // because the ids come from posts already scoped to this agency's clients.
    fetchImagesByPost(pendingPostRows.map((post) => post.id)),
    buildChangeRequests(
      supabase,
      (changeRequestsRes.data as ChangeRequestRow[] | null) ?? [],
      clientNames
    ),
  ])

  const pendingPosts = pendingPostRows.map((post) => ({
    id: post.id,
    caption: post.caption,
    platform: post.platform,
    pillar: post.pillar ?? '',
    createdAt: post.created_at,
    clientName: clientNames.get(post.client_id) ?? 'Unknown',
    imageUrl: imagesByPost.get(post.id)?.[0]?.publicUrl ?? null,
  }))

  const toPublish = (row: PublishRow) => ({
    id: row.id,
    clientName: clientNames.get(row.client_id) ?? 'Unknown',
    platform: row.platform ?? 'instagram',
    scheduledAt: row.scheduled_at,
  })

  const upcomingPublishes = ((upcomingRes.data as PublishRow[] | null) ?? [])
    .map(toPublish)
    // scheduled_at drives the whole card, so a null one has nothing to say.
    .filter((row): row is UpcomingPublish => row.scheduledAt !== null)

  const failedPublishes = ((failedRes.data as PublishRow[] | null) ?? []).map(toPublish)

  return {
    metrics: {
      scheduledThisWeek: readCount(scheduledRes, 'scheduled this week'),
      pendingCount: pendingRows.length,
      oldestPendingAt,
      clientPendingMap,
      clientsAddedThisMonth,
      connectedClientCount: connectedClients.size,
    },
    briefing: briefingRes.data as DashboardBriefing | null,
    pendingPosts,
    changeRequests,
    upcomingPublishes,
    failedPublishes,
  }
}
