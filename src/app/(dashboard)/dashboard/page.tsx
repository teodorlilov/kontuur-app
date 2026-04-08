import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients } from '@/lib/queries/cache'
import { Topbar } from '@/components/layout/topbar'
import { DashboardView } from '@/features/dashboard/components/dashboard-view'
import { PageTransition } from '@/components/providers/page-transition'

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

  // Start briefing query immediately — independent of clientIds, runs in parallel with stats
  const briefingQuery = supabase
    .from('intelligence_briefings')
    .select('briefing_text, action_nudge, weekly_tip, platform_updates, week_start, coaching_points')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (clientIds.length > 0) {
    const [pendingRes, scheduledRes, publishedRes, clientPendingRes] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review')
        .in('client_id', clientIds),
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
      supabase
        .from('posts')
        .select('client_id')
        .eq('status', 'pending_review')
        .in('client_id', clientIds),
    ])

    pendingCount = pendingRes.count ?? 0
    scheduledCount = scheduledRes.count ?? 0
    publishedCount = publishedRes.count ?? 0

    const pendingRows = (clientPendingRes.data as Array<{ client_id: string }> | null) ?? []
    for (const row of pendingRows) {
      clientPendingMap[row.client_id] = (clientPendingMap[row.client_id] ?? 0) + 1
    }
  }

  // Collect briefing — has been running while stats ran
  const { data: rawBriefing } = await briefingQuery

  const briefing = rawBriefing as {
    briefing_text: string | null
    action_nudge: string | null
    weekly_tip: string | null
    platform_updates: string[] | null
    week_start: string | null
    coaching_points: string[] | null
  } | null

  return (
    <>
      <Topbar title="Dashboard" />
      <PageTransition className="p-10 flex flex-col gap-6">
        <DashboardView
          isSolo={isSolo}
          clientCount={clients.length}
          pendingCount={pendingCount}
          scheduledCount={scheduledCount}
          publishedCount={publishedCount}
          clients={clients}
          clientPendingMap={clientPendingMap}
          briefing={briefing}
        />
      </PageTransition>
    </>
  )
}
