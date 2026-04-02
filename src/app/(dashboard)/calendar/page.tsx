import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Topbar } from '@/components/layout/topbar'
import { CalendarView } from '@/features/calendar/components/calendar-view'
import type { CalendarPost, BestTimePlatform } from '@/types/api'

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: rawUserData } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single()

  const userData = rawUserData as { agency_id: string } | null
  if (!userData) redirect('/login')

  const agencyId = userData.agency_id

  // Fetch clients with brand profile best_time_json
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, brand_profiles(best_time_json)')
    .eq('agency_id', agencyId)

  type ClientRow = {
    id: string
    name: string
    brand_profiles: { best_time_json: unknown } | null
  }

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clientIds = clientList.map((c) => c.id)
  const clients = clientList.map((c) => ({ id: c.id, name: c.name }))

  // Build best-time lookup
  const bestTimeMap: Record<string, BestTimePlatform[]> = {}
  for (const c of clientList) {
    const btj = c.brand_profiles?.best_time_json
    if (Array.isArray(btj)) {
      bestTimeMap[c.id] = btj as BestTimePlatform[]
    }
  }

  // Fetch approved + scheduled posts
  let posts: CalendarPost[] = []

  if (clientIds.length > 0) {
    const { data: postRows } = await supabase
      .from('posts')
      .select('id, client_id, caption, platform, post_type, slides_json, carousel_quality_json, status, scheduled_at, priority, quality_score_avg, source_url, source_title, source_type, pillar, source_excerpt, created_at')
      .in('client_id', clientIds)
      .in('status', ['approved', 'scheduled'])
      .order('created_at', { ascending: false })

    type PostRow = {
      id: string
      client_id: string
      caption: string | null
      platform: string | null
      post_type: string
      slides_json: unknown
      carousel_quality_json: unknown
      status: string
      scheduled_at: string | null
      priority: boolean
      quality_score_avg: number | null
      source_url: string | null
      source_title: string | null
      source_type: string | null
      pillar: string | null
      source_excerpt: string | null
      created_at: string
    }

    const clientNameMap = new Map(clientList.map((c) => [c.id, c.name]))

    // Fetch approval statuses for these posts
    const postIds = ((postRows as PostRow[] | null) ?? []).map((p) => p.id)
    const approvalMap = new Map<string, { status: string; client_note: string | null }>()

    if (postIds.length > 0) {
      const { data: tokenRows } = await supabase
        .from('post_approval_tokens')
        .select('post_id, status, client_note')
        .in('post_id', postIds)
        .order('created_at', { ascending: false })

      if (tokenRows) {
        // Use the latest token per post
        for (const row of tokenRows) {
          if (!approvalMap.has(row.post_id)) {
            approvalMap.set(row.post_id, { status: row.status, client_note: row.client_note })
          }
        }
      }
    }

    posts = ((postRows as PostRow[] | null) ?? []).map((p) => {
      const approval = approvalMap.get(p.id)
      return {
        ...p,
        slides_json: p.slides_json as CalendarPost['slides_json'],
        carousel_quality_json: p.carousel_quality_json as CalendarPost['carousel_quality_json'],
        client_name: clientNameMap.get(p.client_id) ?? 'Unknown',
        approval_status: approval?.status ?? null,
        approval_client_note: approval?.client_note ?? null,
      }
    })
  }

  return (
    <>
      <Topbar title="Calendar" />
      <div className="p-6">
        <CalendarView
          initialPosts={posts}
          clients={clients}
          bestTimeMap={bestTimeMap}
        />
      </div>
    </>
  )
}
