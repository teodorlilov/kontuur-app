import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { DashboardView } from '@/features/dashboard/components/dashboard-view'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get agency info
  const { data: rawUserData } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single()

  const userData = rawUserData as { agency_id: string } | null
  if (!userData) redirect('/login')

  const agencyId = userData.agency_id

  const { data: rawAgencyData } = await supabase
    .from('agencies')
    .select('mode')
    .eq('id', agencyId)
    .single()

  const agencyData = rawAgencyData as { mode: string } | null
  const isSolo = agencyData?.mode === 'solo'

  // Fetch all clients for this agency
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, niche')
    .eq('agency_id', agencyId)

  const clients = (clientRows as Array<{ id: string; name: string; niche: string | null }> | null) ?? []
  const clientIds = clients.map((c) => c.id)

  // Stats
  const startOfWeek = new Date()
  startOfWeek.setHours(0, 0, 0, 0)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())

  let pendingCount = 0
  let scheduledCount = 0
  let publishedCount = 0
  const clientPendingMap: Record<string, number> = {}

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

  // Latest intelligence briefing
  const { data: rawBriefing } = await supabase
    .from('intelligence_briefings')
    .select('briefing_text, action_nudge, weekly_tip, platform_updates, week_start, coaching_points')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

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
      <div className="p-6 space-y-6">
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
      </div>
    </>
  )
}
