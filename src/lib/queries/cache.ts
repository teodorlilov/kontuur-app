import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  AGENCY_COLUMNS,
  CLIENT_LIST_COLUMNS,
  CLIENT_ROSTER_COLUMNS,
  UPCOMING_POST_COLUMNS,
} from '@/lib/queries/select-columns'
import { fetchLanguageRulesByLanguage } from '@/lib/queries/db'
import { getWeekDayKeys, getWeekRange, toDateKey } from '@/utils/date-helpers'
import { DAYS_PER_WEEK } from '@/utils/constants'
import type { PostStatus } from '@/lib/validation'
import type { Database } from '@/types/database'
// The roster owns its own input contract; this layer fills it rather than
// exporting whatever shape PostgREST happened to return.
import type { PendingApprovalRow, RosterClientRow } from '@/features/clients/lib/roster'
import type { PostSummary } from '@/types/post'

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
 * Returns all clients for the given agencyId with commonly needed columns.
 * - unstable_cache: persists in Next.js Data Cache across requests (60s TTL, 'agency-clients' tag)
 * - React cache(): deduplicates within a single SSR request so layout + page share one result
 * Call revalidateTag('agency-clients') after any client mutation to clear stale entries immediately.
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

/** Whether a given day of a client's week is published, scheduled, or still open. */
export type DayState = 'published' | 'scheduled' | 'open'


/**
 * Statuses that mean a slot is filled but has not gone out yet. Exported so the
 * dashboard's "scheduled this week" count and this coverage grid can never
 * measure different things while sitting on the same card.
 */
export const SCHEDULED_STATUSES = [
  'approved',
  'scheduled',
  'publishing',
] as const satisfies readonly PostStatus[]

const SCHEDULED_STATUS_SET = new Set<string>(SCHEDULED_STATUSES)

interface CoverageRow {
  client_id: string
  status: string
  scheduled_at: string | null
  published_at: string | null
}

/**
 * Returns each client's week as seven day states, Monday first.
 * weekStartISO must be a 'YYYY-MM-DD' Monday (see getMondayISO) and timeZone the
 * agency's IANA zone — both are part of the cache key, so the entry rolls over
 * naturally at that agency's week boundary.
 * Call revalidateTag('client-post-stats') after post mutations.
 */
const _fetchClientWeekCoverage = unstable_cache(
  async (
    agencyId: string,
    weekStartISO: string,
    timeZone: string
  ): Promise<Record<string, DayState[]>> => {
    const supabase = createAdminSupabaseClient()
    const { from, to } = getWeekRange(weekStartISO, timeZone)

    // A post counts for this week by when it is due, or by when it actually went
    // out (posts published on demand carry no scheduled_at).
    const { data, error } = await supabase
      .from('posts')
      .select('client_id, status, scheduled_at, published_at, clients!inner(agency_id)')
      .eq('clients.agency_id', agencyId)
      .or(
        `and(scheduled_at.gte.${from},scheduled_at.lt.${to}),` +
          `and(published_at.gte.${from},published_at.lt.${to})`
      )

    // Without this the dashboard would quietly render every client's week as
    // empty, which reads as real data rather than as a failure.
    if (error) {
      console.error('[cache] client week coverage query failed:', error.message)
      return {}
    }

    const dayKeys = getWeekDayKeys(weekStartISO)
    const coverage: Record<string, DayState[]> = {}

    for (const row of (data as CoverageRow[] | null) ?? []) {
      const stamp = row.scheduled_at ?? row.published_at
      if (!stamp) continue

      // Bucket in the same zone the range was built from, or a post near
      // midnight lands in a column the query never covered.
      const dayIndex = dayKeys.indexOf(toDateKey(new Date(stamp), timeZone))
      if (dayIndex === -1) continue

      const week = (coverage[row.client_id] ??= Array<DayState>(DAYS_PER_WEEK).fill('open'))

      // Published wins the slot — it is the stronger signal for the day.
      if (row.status === 'published') {
        week[dayIndex] = 'published'
      } else if (SCHEDULED_STATUS_SET.has(row.status) && week[dayIndex] === 'open') {
        week[dayIndex] = 'scheduled'
      }
    }

    return coverage
  },
  ['client-week-coverage'],
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

/**
 * Upcoming posts across the agency, earliest first, so the roster can show each
 * client's next slot and how many are queued behind it.
 *
 * Read by two surfaces: the roster needs only the client and the time, while the
 * dashboard's "going out next" card lists individual publishes from this same
 * entry — so the select carries id and platform and is not free to shrink.
 *
 * Call revalidateTag('client-post-stats') after post mutations.
 */
const _fetchUpcomingByClient = unstable_cache(
  async (agencyId: string): Promise<PostSummary[]> => {
    const supabase = createAdminSupabaseClient()
    // Evaluated at cache-fill time, not per request — harmless over a 60s TTL,
    // and keeping it out of the arguments is what lets requests share the entry.
    const { data, error } = await supabase
      .from('posts')
      .select(UPCOMING_POST_COLUMNS)
      .in('status', SCHEDULED_STATUSES)
      .eq('clients.agency_id', agencyId)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    if (error) {
      console.error('[roster] upcoming fetch failed:', error.message)
      return []
    }
    // WHY as: the clients!inner join is a filter only; its column is not read.
    return (data ?? []) as unknown as PostSummary[]
  },
  ['client-upcoming'],
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

