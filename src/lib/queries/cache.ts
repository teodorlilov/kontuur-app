import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { entitlementFor, noEntitlement, type Entitlement } from '@/lib/billing/entitlement'
import {
  AGENCY_COLUMNS,
  CLIENT_LIST_COLUMNS,
  CLIENT_ROSTER_COLUMNS,
  PUBLICATION_EMBED,
  UPCOMING_POST_COLUMNS,
} from '@/lib/queries/select-columns'
import { fetchLanguageRulesByLanguage } from '@/lib/queries/db'
import { getWeekDayKeys, getWeekRange } from '@/utils/date-helpers'
import type { PostStatus } from '@/lib/validation'
import type { Database } from '@/types/database'
// The roster owns its own input contract; this layer fills it rather than
// exporting whatever shape PostgREST happened to return.
import type { PendingApprovalRow, RosterClientRow } from '@/features/clients/lib/roster'
// Same reason: the inbox owns what "waiting on a decision" means, and the badge
// has to count that population rather than a second guess at it.
import { AWAITING_DECISION } from '@/features/ideas/lib/idea-filters'
import type { PostSummary } from '@/types/post'
import {
  foldWeekCoverage,
  type PostWithPublications,
  type PublishedPostRow,
  type WeekDay,
} from '@/lib/queries/week-coverage'
import { publishStateOf, toPublicationSummary } from '@/lib/posts/publish-state'

type Agency = Database['public']['Tables']['agencies']['Row']
type Client = Database['public']['Tables']['clients']['Row']

/**
 * Returns the full agency row for the given agencyId.
 * - unstable_cache: persists in Next.js Data Cache across requests (60s TTL, 'agencies' tag)
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Call revalidateTag('agencies') after any agency mutation to clear stale entries immediately.
 */
const _fetchAgency = unstable_cache(
  async (agencyId: string): Promise<Agency | null> => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('agencies')
      .select(AGENCY_COLUMNS)
      .eq('id', agencyId)
      .single()
    return data as Agency | null
  },
  ['agency'],
  { revalidate: 60, tags: ['agencies'] }
)

export const getCachedAgency = cache(_fetchAgency)

/**
 * What the workspace may do, derived from the same cached agency read every dashboard render
 * already makes — no second agencies query. Inherits that read's 60 s staleness and its
 * 'agencies' tag: whatever changes the billing columns (the settings PUT, the Stripe webhook)
 * must `revalidateTag('agencies')`. A missing row is a locked workspace, never an open one.
 */
export const getCachedEntitlement = cache(async (agencyId: string): Promise<Entitlement> => {
  const agency = await getCachedAgency(agencyId)
  return agency ? entitlementFor(agency, new Date()) : noEntitlement()
})

/**
 * Returns all clients for the given agencyId with commonly needed columns.
 * - unstable_cache: persists in Next.js Data Cache across requests (60s TTL, 'agency-clients' tag)
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Call revalidateTag('agency-clients', …) after any client mutation. Only the `{ expire: 0 }` profile
 * clears the entry for the very next read; 'max' is stale-while-revalidate and serves it once more.
 *
 * Note: pages that require joined data (brand_profiles, contact_email) should
 * issue their own targeted queries in addition to calling this function.
 */
const _fetchAgencyClients = unstable_cache(
  async (
    agencyId: string
  ): Promise<
    Pick<Client, 'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'>[]
  > => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('clients')
      .select(CLIENT_LIST_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true })
    return (data ?? []) as Pick<
      Client,
      'id' | 'name' | 'niche' | 'posts_per_week' | 'language' | 'created_at'
    >[]
  },
  ['agency-clients'],
  { revalidate: 60, tags: ['agency-clients'] }
)

export const getCachedAgencyClients = cache(_fetchAgencyClients)

/**
 * Returns the language rules for one language — reference data shared by every agency.
 * - unstable_cache: persists in Next.js Data Cache across requests (1h TTL, 'language-rules' tag);
 *   the rows are near-immutable, and without this the generate page re-queried them per navigation
 * - React cache(): deduplicates within a single SSR request
 * Call revalidateTag('language-rules') if the rules are ever edited.
 */
const _fetchLanguageRules = unstable_cache(
  async (language: string) => fetchLanguageRulesByLanguage(createAdminSupabaseClient(), language),
  ['language-rules'],
  { revalidate: 3600, tags: ['language-rules'] }
)

export const getCachedLanguageRules = cache(_fetchLanguageRules)

export interface PendingRow {
  client_id: string
  created_at: string
}

/**
 * Returns pending-review post rows for all clients of the given agency.
 * created_at is included so callers can report how long the queue has been waiting.
 * - unstable_cache: persists in Next.js Data Cache across requests (30s TTL, 'client-post-stats' tag)
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Keyed by agencyId so the cache key is a primitive — no array reference issues.
 */
const _fetchPendingRows = unstable_cache(
  async (agencyId: string): Promise<PendingRow[]> => {
    const supabase = createAdminSupabaseClient()
    const { data } = await supabase
      .from('posts')
      .select('client_id, created_at, clients!inner(agency_id)')
      .eq('status', 'pending_review')
      .eq('clients.agency_id', agencyId)
    return (data as PendingRow[] | null) ?? []
  },
  ['pending-rows'],
  { revalidate: 30, tags: ['client-post-stats'] }
)

export const getCachedPendingRows = cache(_fetchPendingRows)

/**
 * Ideas still awaiting a decision, for the sidebar badge.
 *
 * Lives here rather than in the ideas feature because of where it is read: the
 * dashboard layout renders it into a shell that survives client navigation, so
 * dismissing an idea left the badge stale until a hard reload. Being a tagged
 * entry is what lets the idea actions clear it.
 *
 * Call revalidateTag('client-ideas') after any idea mutation.
 */
const _fetchNewIdeasCount = unstable_cache(
  async (agencyId: string): Promise<number> => {
    const supabase = createAdminSupabaseClient()
    const { count, error } = await supabase
      .from('client_ideas')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      // The same population the Inbox tab shows. Counting its own predicate here
      // is how the badge and the tab came to disagree about a stranded row.
      .in('status', [...AWAITING_DECISION])
    if (error) {
      // A badge is not worth failing the whole shell for; every other page in the
      // layout still renders. Logged so it is a reported failure, not a silent zero.
      console.error('[cache] new ideas count failed:', error.message)
      return 0
    }
    return count ?? 0
  },
  ['new-ideas-count'],
  { revalidate: 60, tags: ['client-ideas'] }
)

export const getCachedNewIdeasCount = cache(_fetchNewIdeasCount)

/**
 * Statuses that mean a slot is filled but has not gone out yet. Exported so the
 * dashboard's "scheduled this week" count and this coverage grid can never
 * measure different things while sitting on the same card.
 */
export const SCHEDULED_STATUSES = ['approved', 'scheduled'] as const satisfies readonly PostStatus[]

/**
 * Returns each client's week as seven days, Monday first — each day's state, the post that set it
 * and how many posts touched it (`WeekDay`, folded by `foldWeekCoverage`).
 * weekStartISO must be a 'YYYY-MM-DD' Monday (see getMondayISO) and timeZone the
 * agency's IANA zone — both are part of the cache key, so the entry rolls over
 * naturally at that agency's week boundary.
 * Call revalidateTag('client-post-stats') after post mutations; bump the key when the cached
 * shape changes, the Data Cache survives deploys.
 */
const _fetchClientWeekCoverage = unstable_cache(
  async (
    agencyId: string,
    weekStartISO: string,
    timeZone: string
  ): Promise<Record<string, WeekDay[]>> => {
    const supabase = createAdminSupabaseClient()
    const { from, to } = getWeekRange(weekStartISO, timeZone)

    /**
     * A post counts for this week by when it is DUE, or by when it actually WENT OUT — a post
     * published on demand carries no `scheduled_at` at all, so neither half alone is the week.
     *
     * Two queries rather than one. This was a single `.or()` reaching through the embed, and
     * PostgREST rejected it outright at runtime: a logic tree cannot mix a parent column with an
     * embedded resource's column, so the whole grid errored and every client rendered as empty.
     * The two halves are genuinely different questions — one about `posts`, one about
     * `post_publications` — and asking them separately is what the repo already does wherever an
     * OR cannot be expressed.
     *
     * Both are bounded at BOTH ends. The published half was `.gte(from)` with no upper bound,
     * which dragged in every future publication for the TS side to discard.
     */
    const [due, published] = await Promise.all([
      supabase
        .from('posts')
        .select(`id, client_id, scheduled_at, ${PUBLICATION_EMBED}, clients!inner(agency_id)`)
        .eq('clients.agency_id', agencyId)
        .in('status', SCHEDULED_STATUSES)
        .gte('scheduled_at', from)
        .lt('scheduled_at', to),
      // `!inner` is load-bearing twice: it restricts the posts to those that actually published
      // in the window, and it trims each row's embed to the publications that did. On a plain
      // embed these filters would neither drop a parent nor empty its array.
      supabase
        .from('posts')
        .select('id, client_id, post_publications!inner(published_at), clients!inner(agency_id)')
        .eq('clients.agency_id', agencyId)
        .eq('post_publications.status', 'published')
        .gte('post_publications.published_at', from)
        .lt('post_publications.published_at', to),
    ])

    // Without this the dashboard would quietly render every client's week as
    // empty, which reads as real data rather than as a failure.
    const error = due.error ?? published.error
    if (error) {
      console.error('[cache] client week coverage query failed:', error.message)
      return {}
    }

    return foldWeekCoverage({
      // WHY as: the embedded selects do not infer; the two row types name what each query returns.
      published: (published.data as unknown as PublishedPostRow[] | null) ?? [],
      due: (due.data as unknown as PostWithPublications[] | null) ?? [],
      dayKeys: getWeekDayKeys(weekStartISO),
      timeZone,
    })
  },
  ['client-week-coverage-v2'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedClientWeekCoverage = cache(_fetchClientWeekCoverage)

/* ─── Clients roster ────────────────────────────────────────────────────────
 * Three queries that the /clients page runs in parallel via Promise.all. None
 * depends on another's result: each scopes itself to the agency directly, so
 * this is one round trip rather than a fetch-clients-then-fetch-their-posts
 * waterfall. features/clients/lib/roster.ts joins them in memory by client_id.
 *
 * Tags differ on purpose. The roster itself turns over on client and connection
 * edits ('agency-clients'); the other two are post-derived and turn over on post
 * and approval mutations ('client-post-stats').
 */

/**
 * Every client in the agency with its social connections.
 * Call revalidateTag('agency-clients') after any client or connection mutation.
 */
const _fetchClientRoster = unstable_cache(
  async (agencyId: string): Promise<RosterClientRow[]> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('clients')
      .select(CLIENT_ROSTER_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[roster] client fetch failed:', error.message)
      return []
    }
    // WHY as: the generated types cannot express an embedded select's shape, and
    // social_connections is a reverse relationship so it arrives as an array.
    return (data ?? []) as unknown as RosterClientRow[]
  },
  ['client-roster'],
  { revalidate: 60, tags: ['agency-clients'] }
)

export const getCachedClientRoster = cache(_fetchClientRoster)

/** An upcoming post and the networks it still has to go out on. */
export type UpcomingPost = PostSummary & { pendingPlatforms: string[] }

/**
 * Upcoming posts across the agency, earliest first, with the destinations still to go out
 * (after the `unpublished` filter, every destination on a kept post). Call
 * revalidateTag('client-post-stats') after post mutations; bump the key when the cached shape
 * changes, the Data Cache survives deploys.
 */
const _fetchUpcomingByClient = unstable_cache(
  async (agencyId: string): Promise<UpcomingPost[]> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('posts')
      .select(`${UPCOMING_POST_COLUMNS}, ${PUBLICATION_EMBED}`)
      .in('status', SCHEDULED_STATUSES)
      .eq('clients.agency_id', agencyId)
      // "Now" is evaluated at cache-fill time, not per request — harmless over a
      // 60s TTL, and keeping it out of the arguments is what lets requests share
      // the entry.
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    if (error) {
      console.error('[roster] upcoming fetch failed:', error.message)
      return []
    }
    // WHY as: the clients!inner join is a filter only; its column is not read.
    const rows = (data ?? []) as unknown as PostWithPublications[]

    /**
     * Still to go out, judged by the destinations rather than by `posts.status`.
     *
     * The status filter above cannot answer this on its own any more. `posts.status` stops at
     * 'scheduled' and the publish path never advances it, so a post published EARLY from the
     * calendar keeps its future slot and its 'scheduled' status — and was still being reported
     * as an upcoming publish, on the dashboard's "going out next" card and in the roster's
     * queue count, for as long as its original slot stayed in the future.
     *
     * 'unpublished' rather than a hand-written status test, so this can never disagree with the
     * calendar about what a post's publish state is. A failed destination is deliberately not
     * upcoming either: the dashboard surfaces those on their own card, and counting them twice
     * would overstate the queue.
     */
    return rows
      .filter(
        ({ post_publications }) =>
          publishStateOf((post_publications ?? []).map(toPublicationSummary)) === 'unpublished'
      )
      .map(({ post_publications, ...post }) => ({
        ...post,
        pendingPlatforms: (post_publications ?? []).map((publication) => publication.platform),
      }))
  },
  ['client-upcoming-v2'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedUpcomingByClient = cache(_fetchUpcomingByClient)

/** One row per post still awaiting a client's approval decision. */
interface ApprovalJoinRow {
  created_at: string | null
  posts: { client_id: string | null } | null
}

/**
 * Posts sent to a client for approval and still unanswered.
 *
 * The expires_at filter is load-bearing. Tokens lapse after
 * APPROVAL_TOKEN_EXPIRY_HOURS but their status stays 'pending' forever and
 * nothing sweeps them, so filtering on status alone would count every abandoned
 * batch ever sent — inflating the summary band, the chip, and the row together.
 *
 * Call revalidateTag('client-post-stats') after approval mutations.
 */
const _fetchPendingApprovalsByClient = unstable_cache(
  async (agencyId: string): Promise<PendingApprovalRow[]> => {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase
      .from('post_approval_tokens')
      .select('created_at, posts!inner(client_id, clients!inner(agency_id))')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .eq('posts.clients.agency_id', agencyId)
    if (error) {
      console.error('[roster] approvals fetch failed:', error.message)
      return []
    }
    // WHY as: both embeds follow a forward FK, so each arrives as an object
    // rather than an array — the reverse of the social_connections case above.
    const rows = (data ?? []) as unknown as ApprovalJoinRow[]
    return rows.map((row) => ({
      client_id: row.posts?.client_id ?? null,
      created_at: row.created_at,
    }))
  },
  ['client-pending-approvals'],
  { revalidate: 60, tags: ['client-post-stats'] }
)

export const getCachedPendingApprovalsByClient = cache(_fetchPendingApprovalsByClient)
