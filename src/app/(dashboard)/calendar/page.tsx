import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import { CalendarView } from '@/features/calendar/components/calendar-view'
import type { CalendarPost } from '@/types/api'

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
  }

  const [{ data: clientRows }, { data: postRows }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, contact_email')
      .eq('agency_id', agencyId),
    clientIds.length > 0
      ? supabase
          .from('posts')
          .select(`${POST_COLUMNS}, post_approval_tokens(status, client_note, created_at, responded_at)`)
          .in('client_id', clientIds)
          .in('status', ['approved', 'scheduled'])
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clients = clientList.map((c) => ({
    id: c.id,
    name: c.name,
    contact_email: c.contact_email ?? null,
  }))

  type ApprovalTokenRow = { status: string; client_note: string | null; created_at: string; responded_at: string | null }

  type PostRow = {
    id: string
    client_id: string
    caption: string | null
    platform: string | null
    post_type: string
    slides_json: unknown
    validation_json: unknown
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
    post_approval_tokens: ApprovalTokenRow[]
  }

  const clientNameMap = new Map(clientList.map((c) => [c.id, c.name]))
  const typedPostRows = (postRows as PostRow[] | null) ?? []

  const posts: CalendarPost[] = typedPostRows.map((p) => {
    // Sort tokens by created_at desc and take the latest
    const latestToken = p.post_approval_tokens
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    return {
      ...p,
      slides_json: p.slides_json as CalendarPost['slides_json'],
      validation_json: p.validation_json as CalendarPost['validation_json'],
      client_name: clientNameMap.get(p.client_id) ?? 'Unknown',
      approval_status: latestToken?.status ?? null,
      approval_client_note: latestToken?.client_note ?? null,
      approval_responded_at: latestToken?.responded_at ?? null,
    }
  })

  return (
    <CalendarView initialPosts={posts} clients={clients} />
  )
}
