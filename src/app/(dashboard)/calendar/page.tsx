import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgencyClients } from '@/lib/queries/cache'
import { POST_COLUMNS, type PostColumns } from '@/lib/queries/select-columns'
import type { PostStatus } from '@/lib/validation'
import { fetchImagesByPost } from '@/features/publishing/lib/fetch-post-images'
import { parseBestTimes } from '@/lib/scheduling/schemas'
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
    // Forward FK, so PostgREST returns an object rather than an array — the same
    // embed /review already uses. best_time_json is validated before use, never cast.
    brand_profiles: { best_time_json: unknown } | null
  }

  const [{ data: clientRows }, { data: postRows }] = await Promise.all([
    supabase
          .from('clients')
          .select('id, name, contact_email, brand_profiles(best_time_json)')
          .eq('agency_id', agencyId),
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
  // posts_per_week comes from the cached roster rather than a second query — it is
  // already in CLIENT_LIST_COLUMNS and was being fetched and discarded here. It is the
  // target the Clients view measures coverage against, and the one number in the
  // deficit claim that a human actually set.
  const perWeekByClient = new Map(cachedClients.map((c) => [c.id, c.posts_per_week ?? 0]))
  const clients = clientList.map((c) => ({
    id: c.id,
    name: c.name,
    contact_email: c.contact_email ?? null,
    posts_per_week: perWeekByClient.get(c.id) ?? 0,
    // Parsed here, server-side: a malformed row becomes "no suggestion" rather than a
    // throw inside a grid render, and zod stays out of the calendar's bundle.
    best_times: parseBestTimes(c.brand_profiles?.best_time_json),
  }))

  type ApprovalTokenRow = {
    status: string
    client_note: string | null
    created_at: string
    responded_at: string | null
  }

  // `PostColumns`, not a local Pick: this page used to restate 15 of the 23 columns
  // POST_COLUMNS selects, so six arrived on every load typed as nothing — and its list
  // had already drifted from /review's equivalent.
  type PostQueryRow = PostColumns & {
    post_approval_tokens: ApprovalTokenRow[]
  }

  /**
   * The newest token, which is the one that describes where a post's approval stands.
   *
   * Sorted rather than taking `[0]`: PostgREST does not promise embed order, and a post
   * re-sent for approval has several. Two other readers get this wrong today —
   * `features/dashboard/queries/change-requests.ts` and
   * `features/review/actions/approval-actions.ts` both index `[0]` unordered, and the
   * first does not even select `created_at` to sort by. Promote this when one of them
   * adopts it; it has one consumer until then.
   */
  function latestToken(tokens: ApprovalTokenRow[]): ApprovalTokenRow | undefined {
    return tokens.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  }

  const clientNameMap = new Map(clientList.map((c) => [c.id, c.name]))
  const typedPostRows = (postRows as PostQueryRow[] | null) ?? []

  const imagesByPost = await fetchImagesByPost(typedPostRows.map((p) => p.id))

  const posts: CalendarPost[] = typedPostRows.map((p) => {
    const token = latestToken(p.post_approval_tokens)
    const { post_approval_tokens: _tokens, ...rest } = p
    return {
      ...rest,
      slides_json: p.slides_json as CalendarPost['slides_json'],
      validation_json: p.validation_json as CalendarPost['validation_json'],
      client_name: clientNameMap.get(p.client_id) ?? 'Unknown',
      images: imagesByPost.get(p.id) ?? [],
      approval_status: token?.status ?? null,
      approval_client_note: token?.client_note ?? null,
      approval_responded_at: token?.responded_at ?? null,
    }
  })

  // The view renders the page header itself: the month is the title, and the
  // month lives in its state.
  return <CalendarView initialPosts={posts} clients={clients} />
}
