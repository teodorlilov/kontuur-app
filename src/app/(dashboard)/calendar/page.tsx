import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import { Topbar } from '@/components/layout/topbar'
import { CalendarView } from '@/features/calendar/components/calendar-view'
import type { CalendarPost, BestTimePlatform } from '@/types/api'

export default async function CalendarPage() {
  const { agencyId } = await requireSessionUser()
  const supabase = await createServerSupabaseClient()

  // Cache hit — layout already populated this for the current request
  const cachedClients = await getCachedAgencyClients(agencyId)
  const clientIds = cachedClients.map((c) => c.id)

  type ClientRow = {
    id: string
    name: string
    contact_email: string | null
    brand_profiles: { best_time_json: unknown } | null
  }

  // Fetch clients+brand_profiles and posts in parallel — clientIds from cache (no extra round-trip)
  const [{ data: clientRows }, { data: postRows }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, contact_email, brand_profiles(best_time_json)')
      .eq('agency_id', agencyId),
    clientIds.length > 0
      ? supabase
          .from('posts')
          .select(POST_COLUMNS)
          .in('client_id', clientIds)
          .in('status', ['approved', 'scheduled'])
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clients = clientList.map((c) => ({ id: c.id, name: c.name, contact_email: c.contact_email ?? null }))

  // Build best-time lookup
  const bestTimeMap: Record<string, BestTimePlatform[]> = {}
  for (const c of clientList) {
    const btj = c.brand_profiles?.best_time_json
    if (Array.isArray(btj)) {
      bestTimeMap[c.id] = btj as BestTimePlatform[]
    }
  }

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
  const typedPostRows = (postRows as PostRow[] | null) ?? []

  // Fetch approval statuses for these posts (sequential — genuinely needs postIds)
  const postIds = typedPostRows.map((p) => p.id)
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

  const posts: CalendarPost[] = typedPostRows.map((p) => {
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
