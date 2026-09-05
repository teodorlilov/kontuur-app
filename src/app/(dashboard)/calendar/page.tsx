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
import type { Tables } from '@/types/database'
import { fetchImagesByPost } from '@/lib/posts/fetch-post-images'
import { parseBestTimes } from '@/lib/suggested-times/schemas'
import { toValidationData } from '@/features/review/lib/adapt-validation'
import { CalendarView } from '@/features/calendar/components/calendar-view'
import type { CalendarPost } from '@/types/api'

interface CalendarPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const [{ agencyId }, params] = await Promise.all([requireSessionUser(), searchParams])
  const supabase = await createServerSupabaseClient()

  const [cachedClients, agency] = await Promise.all([
    getCachedAgencyClients(agencyId),
    getCachedAgency(agencyId),
  ])
  const clientIds = cachedClients.map((c) => c.id)
  const timezone = agency?.timezone ?? 'UTC'

  // The loaded window centres on ?week= when the view recentred there, else on
  // today. Any date-key is accepted and snapped to its Monday — the view sends
  // whatever day it walked to, and the server owns turning that into a week.
  const weekParam = params.week
  const anchorWeek =
    typeof weekParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? mondayOfKey(weekParam)
      : getMondayISO(new Date(), timezone)
  const window = getCalendarWindow(anchorWeek, timezone)

  type ClientRow = {
    id: string
    name: string
    contact_email: string | null
    // Forward FK, so PostgREST returns an object rather than an array — the same
    // embed /review already uses. best_time_json is validated before use, never cast.
    brand_profiles: { best_time_json: unknown; best_time_updated_at: string | null } | null
    /**
     * Reverse FK, so an array — a client may hold rows for several platforms.
     *
     * Read only to explain an ABSENT best time. Posting times are measured from Instagram
     * follower-online counts or they do not exist, and "no account connected" and "connected,
     * still collecting" are different things to tell a user. Embedded on the query that was
     * already fetching these clients rather than added as a per-client lookup.
     */
    social_connections: Array<{ platform: string; account_id: string | null }> | null
  }

  const [{ data: clientRows, error: clientError }, { data: postRows, error: postError }] =
    await Promise.all([
      supabase
        .from('clients')
        .select(
          'id, name, contact_email, brand_profiles(best_time_json, best_time_updated_at), social_connections(platform, account_id)'
        )
        .eq('agency_id', agencyId),
      clientIds.length > 0
        ? supabase
            .from('posts')
            .select(
              `${POST_COLUMNS}, ${PUBLICATION_EMBED}, post_approval_tokens(status, client_note, created_at, responded_at, expires_at)`
            )
            .in('client_id', clientIds)
            // Editorial statuses only: a post that has gone out, or tried to, is still
            // 'scheduled' here — where it got to is its publications' business, and they ride
            // along on the embed.
            .in('status', ['approved', 'scheduled'] satisfies readonly PostStatus[])
            // A post is in the window by when it goes out. Dateless rows (approved but
            // unslotted) always ride along — they are the tray the calendar exists to drain,
            // and a date filter would hide them.
            //
            // The old second arm matched on posts.published_at, which no longer exists: an
            // on-demand publish stamps scheduled_at at the moment it starts (see the publish
            // route), so those rows are caught by the first arm now.
            .or(
              `and(scheduled_at.gte.${window.from},scheduled_at.lt.${window.to}),` +
                `scheduled_at.is.null`
            )
            .order('created_at', { ascending: false })
        : // `error: null` so the tuple keeps one shape — the guard below reads it off both arms.
          Promise.resolve({ data: [] as unknown[], error: null }),
    ])

  /**
   * Both errors were discarded, so any PostgREST failure rendered as a perfectly normal, empty
   * calendar — the same shape as an agency with nothing scheduled. That is precisely how the
   * coverage grid's broken query hid: a page that draws nothing looks like real data.
   *
   * Logged at the boundary and re-thrown, because there is no honest empty state to fall back
   * to here. An error page says something is wrong; an empty calendar says the opposite.
   */
  const loadError = clientError ?? postError
  if (loadError) {
    console.error('[calendar] page query failed:', loadError.message)
    throw new Error('Could not load the calendar')
  }

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
    // When those times were last derived. Surfaced because nothing else can tell a live
    // measurement from a fossil: the column has no expiry, so a client whose Meta sync broke in
    // June keeps showing June's hours as though they were yesterday's.
    best_time_updated_at: c.brand_profiles?.best_time_updated_at ?? null,
    // An account_id is what the metrics sync actually needs; a connection row without one
    // cannot produce follower-online data, so it does not count as connected here.
    instagram_connected: (c.social_connections ?? []).some(
      (conn) => conn.platform === 'instagram' && conn.account_id
    ),
  }))

  // Derived, not restated. Adding `expires_at` pushed this to five fields and
  // `row-mirrors` correctly called it a hand-written copy of the table — and the copy
  // was already wrong: it declared `created_at: string` over a nullable column, which
  // is what `latestToken` below was sorting on.
  type ApprovalTokenRow = Pick<
    Tables<'post_approval_tokens'>,
    'status' | 'client_note' | 'created_at' | 'responded_at' | 'expires_at'
  >

  // `PostColumns`, not a local Pick: this page used to restate 15 of the 23
  // columns POST_COLUMNS selects, so six arrived on every load typed as nothing — and
  // its list had already drifted from /review's equivalent.
  type PostQueryRow = PostColumns & {
    post_approval_tokens: ApprovalTokenRow[]
    post_publications: PublicationEmbedColumns[]
  }

  /**
   * The newest token, which is the one that describes where a post's approval stands.
   *
   * Sorted rather than taking `[0]`: PostgREST does not promise embed order, and a post
   * re-sent for approval has several. Two other readers get this wrong today —
   * `features/dashboard/queries/change-requests.ts` and
   * `features/approval-portal/actions/approval-actions.ts` both index `[0]` unordered, and the
   * first does not even select `created_at` to sort by. Promote this when one of them
   * adopts it; it has one consumer until then.
   */
  function latestToken(tokens: ApprovalTokenRow[]): ApprovalTokenRow | undefined {
    // `created_at` is nullable in the schema, and this called `.localeCompare` on it
    // directly — a row inserted without one would have thrown the whole page. It has a
    // default, so nothing has hit it; the type was hiding that it could.
    return tokens.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0]
  }

  const clientNameMap = new Map(clientList.map((c) => [c.id, c.name]))
  const typedPostRows = (postRows as PostQueryRow[] | null) ?? []

  const imagesByPost = await fetchImagesByPost(typedPostRows.map((p) => p.id))

  const posts: CalendarPost[] = typedPostRows.map((p) => {
    const token = latestToken(p.post_approval_tokens)
    // `validation_json` is destructured out, not just omitted from the type. TypeScript does
    // not excess-property-check a spread, so dropping it from `CalendarPost` alone left the
    // raw blob riding along in `rest` on every post — typed as absent, shipped anyway, read
    // by nothing. The type change removed the zod chunk; only this removes the payload.
    const {
      post_approval_tokens: _tokens,
      post_publications: publicationRows,
      validation_json: rawValidation,
      ...rest
    } = p
    return {
      ...rest,
      slides_json: p.slides_json as CalendarPost['slides_json'],
      // Adapted here, server-side, through the same function /review uses — so the card
      // renders identical evidence and zod stays out of the calendar's client bundle.
      // Null (unreadable legacy blob) stays null: the quality panel is omitted, which is
      // exactly what the card already did when its own parse returned null.
      validation: toValidationData(rawValidation),
      client_name: clientNameMap.get(p.client_id) ?? 'Unknown',
      // Renamed on the way out, once: the card speaks camelCase and the table does not, and
      // leaving the raw shape through would put that translation in every consumer.
      publications: publicationRows.map(toPublicationSummary),
      images: imagesByPost.get(p.id) ?? [],
      approval_status: token?.status ?? null,
      approval_client_note: token?.client_note ?? null,
      approval_responded_at: token?.responded_at ?? null,
      approval_expires_at: token?.expires_at ?? null,
    }
  })

  // The view renders the page header itself: the month is the title, and the
  // month lives in its state.
  return <CalendarView initialPosts={posts} clients={clients} anchorWeekISO={anchorWeek} />
}
