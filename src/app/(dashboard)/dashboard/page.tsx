import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients, getCachedPendingRows } from '@/lib/queries/cache'
import { BRIEFING_COLUMNS } from '@/lib/queries/select-columns'
import { Topbar } from '@/components/layout/topbar'
import { DashboardView } from '@/features/dashboard/components/dashboard-view'

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

  // Start briefing + pending post previews immediately — independent of stats
  const briefingQuery = supabase
    .from('intelligence_briefings')
    .select(BRIEFING_COLUMNS)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const pendingPostsQuery = clientIds.length > 0
    ? supabase
        .from('posts')
        .select('id, caption, platform, pillar, created_at, client_id')
        .in('client_id', clientIds)
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(3)
    : Promise.resolve({ data: [] as { id: string; caption: string; platform: string; pillar: string | null; created_at: string; client_id: string }[] })

  if (clientIds.length > 0) {
    // getCachedPendingRows is a React cache hit — layout already populated it for this request
    const [scheduledRes, publishedRes, pendingRows] = await Promise.all([
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
    ])

    scheduledCount = scheduledRes.count ?? 0
    publishedCount = publishedRes.count ?? 0

    pendingCount = pendingRows.length
    for (const row of pendingRows) {
      clientPendingMap[row.client_id] = (clientPendingMap[row.client_id] ?? 0) + 1
    }
  }

  // Collect briefing + pending posts — have been running while stats ran
  const [{ data: rawBriefing }, { data: rawPendingPosts }] = await Promise.all([
    briefingQuery,
    pendingPostsQuery,
  ])

  const briefing = rawBriefing as {
    briefing_text: string | null
    action_nudge: string | null
    weekly_tip: string | null
    platform_updates: string[] | null
    week_start: string | null
    coaching_points: string[] | null
  } | null

  // Build client name lookup for pending post previews
  const clientNameMap: Record<string, string> = {}
  for (const c of clients) {
    clientNameMap[c.id] = c.name
  }

  const pendingPosts = (rawPendingPosts ?? []).map((p) => ({
    id: p.id as string,
    caption: p.caption as string,
    platform: p.platform as string,
    pillar: (p.pillar as string) ?? '',
    createdAt: p.created_at as string,
    clientName: clientNameMap[p.client_id as string] ?? 'Unknown',
  }))

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
      />
    </>
  )
}
