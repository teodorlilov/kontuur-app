import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSessionUser } from '@/lib/auth/session'
import { getCachedAgency, getCachedAgencyClients } from '@/lib/queries/cache'
import { getMondayISO } from '@/utils/date-helpers'
import { getCalendarWindow, mondayOfKey } from '@/features/calendar/lib/calendar-window'
import {
  POST_COLUMNS,
  PUBLICATION_EMBED,
  type PostColumns,
  type PublicationEmbedColumns,
} from '@/lib/queries/select-columns'
import type { PostStatus } from '@/lib/validation'
import { toPublicationSummary } from '@/lib/posts/publish-state'
import { capableDestinations } from '@/features/publishing/lib/destinations'
import type { Tables } from '@/types/database'
import { fetchImagesByPost } from '@/lib/posts/fetch-post-images'
import { toValidationData } from '@/lib/validation/adapt-validation'
import { CalendarView } from '@/features/calendar/components/calendar-view'
import { toPostType } from '@/lib/visual/visual-backlog'
import type { CalendarPost } from '@/types/api'

interface CalendarPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * A client as this page selects it: three `Pick`ed columns plus its connections embed. The embed
 * is a reverse FK, so PostgREST returns an array, one row per connected platform; it rides on the
 * clients query rather than becoming a per-client lookup.
 */
type ClientQueryRow = Pick<Tables<'clients'>, 'id' | 'name' | 'contact_email'> & {
  social_connections: Array<{ platform: string; account_id: string | null }> | null
}

/**
 * The token fields the calendar card reads, derived from the row type rather than restated
 * (src/types/__tests__/row-mirrors.test.ts). `created_at` is nullable there.
 */
type ApprovalTokenRow = Pick<
  Tables<'post_approval_tokens'>,
  'status' | 'client_note' | 'created_at' | 'responded_at' | 'expires_at'
>

/** A post as `POST_COLUMNS` selects it, with its approval-token and publication embeds. */
type PostQueryRow = PostColumns & {
  post_approval_tokens: ApprovalTokenRow[]
  post_publications: PublicationEmbedColumns[]
}

/**
 * The newest token, which is where a post's approval stands. Sorted rather than taking `[0]`:
 * PostgREST does not promise embed order, and a post re-sent for approval has several. A token
 * without `created_at` sorts last rather than throwing.
 */
function latestToken(tokens: ApprovalTokenRow[]): ApprovalTokenRow | undefined {
  return tokens.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0]
}

/**
 * The agency's clients with their connections, and the approved and scheduled posts of the window
 * around `?week=` (any date, snapped to its Monday), else today's week in the agency's timezone.
 * - `access_token` is filtered on, never selected, and shapes the connections embed, not the client
 *   list: a token-less connection is no destination (`resolveDestinations`,
 *   src/features/publishing/lib/destinations.ts).
 * - Dateless posts always load, since they are the unscheduled tray; a failed query throws, since
 *   an empty calendar would read as nothing scheduled.
 * - `validation_json` is destructured out: a spread is not excess-property-checked, so leaving it
 *   off the type alone would still ship the raw blob on every post.
 */
export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const [{ agencyId }, params] = await Promise.all([requireSessionUser(), searchParams])
  const supabase = await createServerSupabaseClient()

  const [cachedClients, agency] = await Promise.all([
    getCachedAgencyClients(agencyId),
    getCachedAgency(agencyId),
  ])
  const clientIds = cachedClients.map((c) => c.id)
  const timezone = agency?.timezone ?? 'UTC'

  const weekParam = params.week
  const anchorWeek =
    typeof weekParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? mondayOfKey(weekParam)
      : getMondayISO(new Date(), timezone)
  const window = getCalendarWindow(anchorWeek, timezone)

  const [{ data: clientRows, error: clientError }, { data: postRows, error: postError }] =
    await Promise.all([
      supabase
        .from('clients')
        .select('id, name, contact_email, social_connections(platform, account_id)')
        .not('social_connections.access_token', 'is', null)
        .eq('agency_id', agencyId),
      clientIds.length > 0
        ? supabase
            .from('posts')
            .select(
              `${POST_COLUMNS}, ${PUBLICATION_EMBED}, post_approval_tokens(status, client_note, created_at, responded_at, expires_at)`
            )
            .in('client_id', clientIds)
            .in('status', ['approved', 'scheduled'] satisfies readonly PostStatus[])
            .or(
              `and(scheduled_at.gte.${window.from},scheduled_at.lt.${window.to}),` +
                `scheduled_at.is.null`
            )
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ])

  const loadError = clientError ?? postError
  if (loadError) {
    console.error('[calendar] page query failed:', loadError.message)
    throw new Error('Could not load the calendar')
  }

  const clientList = (clientRows as ClientQueryRow[] | null) ?? []
  const perWeekByClient = new Map(cachedClients.map((c) => [c.id, c.posts_per_week ?? 0]))
  const clients = clientList.map((c) => ({
    id: c.id,
    name: c.name,
    contact_email: c.contact_email ?? null,
    posts_per_week: perWeekByClient.get(c.id) ?? 0,
    instagram_connected: (c.social_connections ?? []).some(
      (conn) => conn.platform === 'instagram' && conn.account_id
    ),
  }))

  const connectedByClient = new Map(
    clientList.map((c) => [c.id, (c.social_connections ?? []).map((conn) => conn.platform)])
  )

  const clientNameMap = new Map(clientList.map((c) => [c.id, c.name]))
  const typedPostRows = (postRows as PostQueryRow[] | null) ?? []

  const imagesByPost = await fetchImagesByPost(typedPostRows.map((p) => p.id))

  const posts: CalendarPost[] = typedPostRows.map((p) => {
    const token = latestToken(p.post_approval_tokens)
    const {
      post_approval_tokens: _tokens,
      post_publications: publicationRows,
      validation_json: rawValidation,
      ...rest
    } = p
    return {
      ...rest,
      slides_json: p.slides_json as CalendarPost['slides_json'],
      validation: toValidationData(rawValidation),
      client_name: clientNameMap.get(p.client_id) ?? 'Unknown',
      publications: publicationRows.map(toPublicationSummary),
      destinations: capableDestinations(
        connectedByClient.get(p.client_id) ?? [],
        toPostType(p.post_type)
      ),
      images: imagesByPost.get(p.id) ?? [],
      approval_status: token?.status ?? null,
      approval_client_note: token?.client_note ?? null,
      approval_responded_at: token?.responded_at ?? null,
      approval_expires_at: token?.expires_at ?? null,
    }
  })

  return <CalendarView initialPosts={posts} clients={clients} anchorWeekISO={anchorWeek} />
}
