import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedPendingRows, type PendingRow } from '@/lib/queries/cache'
import { BRIEFING_COLUMNS } from '@/lib/queries/select-columns'
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
}

export interface DashboardMetrics {
  scheduledThisWeek: number
  publishedThisMonth: number
  publishedLastMonth: number
  pendingCount: number
  /** Oldest pending post's created_at, or null when the queue is empty. */
  oldestPendingAt: string | null
  clientPendingMap: Record<string, number>
  clientsAddedThisMonth: number
  connectedClientCount: number
}

export interface DashboardData {
  metrics: DashboardMetrics
  briefing: DashboardBriefing | null
  pendingPosts: PendingPostPreview[]
  changeRequests: DashboardChangeRequest[]
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

interface ClientSummary {
  id: string
  name: string
  created_at: string | null
}

const PENDING_PREVIEW_LIMIT = 3
const CHANGE_REQUEST_LIMIT = 5

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
  weekStartISO: string
): Promise<DashboardData> {
  const clientIds = clients.map((client) => client.id)
  const clientNames = new Map(clients.map((client) => [client.id, client.name]))

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const weekStart = new Date(`${weekStartISO}T00:00:00`).toISOString()

  const clientsAddedThisMonth = clients.filter(
    (client) => client.created_at !== null && client.created_at >= monthStart
  ).length

  if (clientIds.length === 0) {
    return {
      metrics: {
        scheduledThisWeek: 0,
        publishedThisMonth: 0,
        publishedLastMonth: 0,
        pendingCount: 0,
        oldestPendingAt: null,
        clientPendingMap: {},
        clientsAddedThisMonth,
        connectedClientCount: 0,
      },
      briefing: null,
      pendingPosts: [],
      changeRequests: [],
    }
  }

  const [
    scheduledRes,
    publishedThisMonthRes,
    publishedLastMonthRes,
    pendingRows,
    connectionsRes,
    briefingRes,
    pendingPostsRes,
    changeRequestsRes,
  ] = await Promise.all([
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gte('scheduled_at', weekStart)
      .in('client_id', clientIds),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('published_at', monthStart)
      .in('client_id', clientIds),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('published_at', lastMonthStart)
      .lt('published_at', monthStart)
      .in('client_id', clientIds),
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

  const { clientPendingMap, oldestPendingAt } = summarisePending(pendingRows)
  const connectedClients = new Set(
    ((connectionsRes.data as Array<{ client_id: string | null }> | null) ?? [])
      .map((row) => row.client_id)
      .filter((id): id is string => id !== null)
  )

  const pendingPosts = ((pendingPostsRes.data as PendingPostRow[] | null) ?? []).map((post) => ({
    id: post.id,
    caption: post.caption,
    platform: post.platform,
    pillar: post.pillar ?? '',
    createdAt: post.created_at,
    clientName: clientNames.get(post.client_id) ?? 'Unknown',
  }))

  return {
    metrics: {
      scheduledThisWeek: scheduledRes.count ?? 0,
      publishedThisMonth: publishedThisMonthRes.count ?? 0,
      publishedLastMonth: publishedLastMonthRes.count ?? 0,
      pendingCount: pendingRows.length,
      oldestPendingAt,
      clientPendingMap,
      clientsAddedThisMonth,
      connectedClientCount: connectedClients.size,
    },
    briefing: briefingRes.data as DashboardBriefing | null,
    pendingPosts,
    changeRequests: await buildChangeRequests(
      supabase,
      (changeRequestsRes.data as ChangeRequestRow[] | null) ?? [],
      clientNames
    ),
  }
}
