import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { POST_COLUMNS } from '@/lib/queries/select-columns'
import type { PostStatus } from '@/lib/validation'
import { fetchImagesByPost } from '@/features/publishing/lib/fetch-post-images'
import { CalendarView } from '@/features/calendar/components/calendar-view'
import type { CalendarPost } from '@/types/api'
import type { PostRow } from '@/types'

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
    supabase.from('clients').select('id, name, contact_email').eq('agency_id', agencyId),
    clientIds.length > 0
      ? supabase
          .from('posts')
          .select(
            `${POST_COLUMNS}, post_approval_tokens(status, client_note, created_at, responded_at)`
          )
          .in('client_id', clientIds)
          .in('status', [
            'approved',
            'scheduled',
            'publishing',
            'published',
            'failed',
          ] satisfies readonly PostStatus[])
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const clientList = (clientRows as ClientRow[] | null) ?? []
  const clients = clientList.map((c) => ({
    id: c.id,
    name: c.name,
    contact_email: c.contact_email ?? null,
  }))

  type ApprovalTokenRow = {
    status: string
    client_note: string | null
    created_at: string
    responded_at: string | null
  }

  type PostQueryRow = Pick<
    PostRow,
    | 'id'
    | 'client_id'
    | 'caption'
    | 'platform'
    | 'post_type'
    | 'status'
    | 'scheduled_at'
    | 'priority'
    | 'quality_score_avg'
    | 'source_url'
    | 'source_title'
    | 'source_type'
    | 'pillar'
    | 'source_excerpt'
    | 'created_at'
  > & {
    slides_json: unknown
    validation_json: unknown
    post_approval_tokens: ApprovalTokenRow[]
  }

  const clientNameMap = new Map(clientList.map((c) => [c.id, c.name]))
  const typedPostRows = (postRows as PostQueryRow[] | null) ?? []

  const imagesByPost = await fetchImagesByPost(typedPostRows.map((p) => p.id))

  const posts: CalendarPost[] = typedPostRows.map((p) => {
    const latestToken = p.post_approval_tokens
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    const { post_approval_tokens: _tokens, ...rest } = p
    return {
      ...rest,
      slides_json: p.slides_json as CalendarPost['slides_json'],
      validation_json: p.validation_json as CalendarPost['validation_json'],
      client_name: clientNameMap.get(p.client_id) ?? 'Unknown',
      images: imagesByPost.get(p.id) ?? [],
      approval_status: latestToken?.status ?? null,
      approval_client_note: latestToken?.client_note ?? null,
      approval_responded_at: latestToken?.responded_at ?? null,
    }
  })

  // The view renders the page header itself: the month is the title, and the
  // month lives in its state.
  return <CalendarView initialPosts={posts} clients={clients} />
}
