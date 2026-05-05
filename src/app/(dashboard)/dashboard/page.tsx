import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients, getCachedPendingRows } from '@/lib/queries/cache'
import { BRIEFING_COLUMNS } from '@/lib/queries/select-columns'
import { Topbar } from '@/components/layout/topbar'
import { DashboardView } from '@/features/dashboard/components/dashboard-view'
import type { DashboardChangeRequest, CarouselSlide } from '@/types/api'

type ChangeRequestRow = {
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

/** Fetch all tokens in the given batches and return a map of postId → 1-indexed position. */
async function computeBatchPositions(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  batchIds: string[],
): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map()
  const { data: batchTokens } = await supabase
    .from('post_approval_tokens')
    .select('batch_id, post_id')
    .in('batch_id', batchIds)
    .order('created_at', { ascending: true })

  const positions = new Map<string, number>()
  const batchOrder = new Map<string, string[]>()
  for (const t of batchTokens ?? []) {
    if (!t.batch_id || !t.post_id) continue
    const arr = batchOrder.get(t.batch_id) ?? []
    arr.push(t.post_id)
    batchOrder.set(t.batch_id, arr)
  }
  for (const [, postIds] of batchOrder) {
    postIds.forEach((pid, i) => positions.set(pid, i + 1))
  }
  return positions
}

/** Map raw change request rows to DashboardChangeRequest[] with batch positions. */
async function buildChangeRequests(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  rows: ChangeRequestRow[] | null,
  clientNameMap: Record<string, string>,
): Promise<DashboardChangeRequest[]> {
  const crRows = rows ?? []
  if (crRows.length === 0) return []

  const batchIds = [...new Set(
    crRows.flatMap((r) => r.post_approval_tokens.map((t) => t.batch_id)).filter(Boolean)
  )]
  const positions = await computeBatchPositions(supabase, batchIds)

  return crRows.map((row) => {
    const token = row.post_approval_tokens[0]!
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: clientNameMap[row.client_id] ?? 'Unknown',
      caption: row.caption,
      platform: row.platform,
      postType: row.post_type,
      // Supabase REST returns untyped JSON — slides_json matches CarouselSlide[] by schema
      slidesJson: row.slides_json as CarouselSlide[] | null,
      scheduledAt: row.scheduled_at,
      clientNote: token.client_note,
      respondedAt: token.responded_at,
      postNumber: positions.get(row.id) ?? 1,
    }
  })
}

export default async function DashboardPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Both calls hit React cache() populated by the dashboard layout — zero extra DB queries
  const [agencyData, clients] = await Promise.all([
    getCachedAgency(agencyId),
    getCachedAgencyClients(agencyId),
  ])

  const isSolo = agencyData?.mode === 'solo'
  const clientIds = clients.map((c) => c.id)

  // Stats
  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())

  let pendingCount = 0
  let scheduledCount = 0
  let publishedCount = 0
  const clientPendingMap: Record<string, number> = {}

  // Build client name lookup for pending post previews
  const clientNameMap: Record<string, string> = {}
  for (const c of clients) {
    clientNameMap[c.id] = c.name
  }

  let rawBriefing: unknown = null
  let rawPendingPosts: unknown[] = []
  let rawChangeRequests: unknown[] = []

  if (clientIds.length > 0) {
    // Run all queries in a single parallel block
    const [scheduledRes, publishedRes, pendingRows, briefingRes, pendingPostsRes, changeRequestsRes] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .gte('scheduled_at', startOfWeek.toISOString())
        .in('client_id', clientIds),
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .in('client_id', clientIds),
      getCachedPendingRows(agencyId),
      supabase
        .from('intelligence_briefings')
        .select(BRIEFING_COLUMNS)
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('posts')
        .select('id, caption, platform, pillar, created_at, client_id')
        .in('client_id', clientIds)
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('posts')
        .select('id, client_id, caption, platform, post_type, slides_json, scheduled_at, post_approval_tokens!inner(status, client_note, responded_at, batch_id)')
        .in('client_id', clientIds)
        .eq('post_approval_tokens.status', 'changes_requested')
        .order('scheduled_at', { ascending: false })
        .limit(5),
    ])

    scheduledCount = scheduledRes.count ?? 0
    publishedCount = publishedRes.count ?? 0

    pendingCount = pendingRows.length
    for (const row of pendingRows) {
      clientPendingMap[row.client_id] = (clientPendingMap[row.client_id] ?? 0) + 1
    }

    rawBriefing = briefingRes.data
    rawPendingPosts = pendingPostsRes.data ?? []
    rawChangeRequests = changeRequestsRes.data ?? []
  }

  const briefing = rawBriefing as {
    briefing_text: string | null
    action_nudge: string | null
    weekly_tip: string | null
    platform_updates: string[] | null
    week_start: string | null
    coaching_points: string[] | null
  } | null

  const pendingPosts = (rawPendingPosts as Array<{ id: string; caption: string; platform: string; pillar: string | null; created_at: string; client_id: string }>).map((p) => ({
    id: p.id,
    caption: p.caption,
    platform: p.platform,
    pillar: p.pillar ?? '',
    createdAt: p.created_at,
    clientName: clientNameMap[p.client_id] ?? 'Unknown',
  }))

  // Process change requests + compute post numbers within batches
  const changeRequests = await buildChangeRequests(
    supabase, rawChangeRequests as ChangeRequestRow[] | null, clientNameMap
  )

  return (
    <>
      <Topbar title="Dashboard" />
      <DashboardView
        isSolo={isSolo}
        clientCount={clients.length}
        pendingCount={pendingCount}
        scheduledCount={scheduledCount}
        publishedCount={publishedCount}
        clients={clients}
        clientPendingMap={clientPendingMap}
        briefing={briefing}
        pendingPosts={pendingPosts}
        changeRequests={changeRequests}
      />
    </>
  )
}
