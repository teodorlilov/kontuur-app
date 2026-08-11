import 'server-only'

import { randomBytes } from 'crypto'
import type { ClientIdea, IdeaStatus } from '@/types/api'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { unwrap } from '@/lib/queries/unwrap'
import { CLIENT_IDEA_COLUMNS } from '@/lib/queries/select-columns'
import { countForTab } from '@/features/ideas/lib/idea-filters'
import { formatClientName } from '@/utils/format'
import type { IdeaBrief } from '@/features/ideas/schemas'

// ── Token helpers (admin client — public routes, no auth) ────

/**
 * Reads a client's existing idea-form token, or null if it has none.
 *
 * Read-only counterpart to `getOrCreateToken`, so a Server Component can render the idea link
 * without a write happening during render. Creating the token stays behind an explicit action.
 *
 * maybeSingle, not single: a client with no token yet is the normal first-run case, and
 * single() reports it as an error that `unwrap` would then escalate into a 500.
 */
export async function fetchTokenByClient(clientId: string): Promise<string | null> {
  const supabase = createAdminSupabaseClient()

  const data = unwrap(
    await supabase.from('idea_form_tokens').select('token').eq('client_id', clientId).maybeSingle(),
    'fetchTokenByClient'
  )

  return data?.token ?? null
}

/** Returns existing token or creates a new one for the client. */
export async function getOrCreateToken(agencyId: string, clientId: string): Promise<string> {
  const existing = await fetchTokenByClient(clientId)
  if (existing) return existing

  // URL-safe, cryptographically random — the token is the only guard on the public form
  const token = randomBytes(16).toString('base64url')

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from('idea_form_tokens').insert({
    agency_id: agencyId,
    client_id: clientId,
    token,
  })

  if (error) throw new Error(`Failed to create idea token: ${error.message}`)

  return token
}

/**
 * Tallies ideas per status for one agency, or one client within it.
 *
 * One query tallied in memory rather than a `head: true` count per status — they differ only by
 * filter, so N statuses cost N round trips to return N integers. Idea volume is small enough that
 * transferring the status column is cheaper than the extra trips.
 *
 * Returns the raw per-status map rather than named buckets, because who groups them is the
 * caller's business: the inbox tabs and the settings rail read the same tally through
 * `countForTab` and cannot end up counting different populations under one word, which is how
 * "used" came to mean two different things a page apart.
 */
export async function countIdeasByStatus(scope: {
  agencyId?: string
  clientId?: string
}): Promise<Record<string, number>> {
  const supabase = createAdminSupabaseClient()

  let query = supabase.from('client_ideas').select('status')
  if (scope.agencyId) query = query.eq('agency_id', scope.agencyId)
  if (scope.clientId) query = query.eq('client_id', scope.clientId)

  const rows = unwrap(await query, 'countIdeasByStatus') ?? []

  const byStatus: Record<string, number> = {}
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
  return byStatus
}

/**
 * Counts a client's submitted ideas for the settings rail.
 *
 * Counted over the whole set rather than derived from a fetched page: the settings tab previews
 * only the three most recent, so a total taken from that array would under-report.
 */
export async function fetchIdeaCounts(
  clientId: string
): Promise<{ newCount: number; usedCount: number; totalCount: number }> {
  const byStatus = await countIdeasByStatus({ clientId })
  return {
    newCount: countForTab('inbox', byStatus),
    usedCount: countForTab('generated', byStatus),
    totalCount: countForTab('all', byStatus),
  }
}

/** Looks up a token row by its public token string; null when the link is unknown. */
export async function fetchTokenByValue(token: string) {
  const supabase = createAdminSupabaseClient()

  return unwrap(
    await supabase
      .from('idea_form_tokens')
      .select('id, agency_id, client_id, token')
      .eq('token', token)
      .maybeSingle(),
    'fetchTokenByValue'
  )
}

/** Fetches client + agency display info for the public form header. */
export async function fetchFormContext(token: string) {
  const tokenRow = await fetchTokenByValue(token)
  if (!tokenRow) return null

  const supabase = createAdminSupabaseClient()
  const [client, agency] = await Promise.all([
    supabase.from('clients').select('name, niche').eq('id', tokenRow.client_id).maybeSingle(),
    supabase.from('agencies').select('name').eq('id', tokenRow.agency_id).maybeSingle(),
  ])

  return {
    tokenId: tokenRow.id,
    clientId: tokenRow.client_id,
    clientName: formatClientName(unwrap(client, 'fetchFormContext.client')?.name),
    agencyId: tokenRow.agency_id,
    agencyName: unwrap(agency, 'fetchFormContext.agency')?.name ?? 'Agency',
  }
}

// ── Submission (admin client — public route) ─────────────────

/**
 * How much one idea link may submit per hour.
 *
 * Not `checkRateLimit`: that is a module-level Map, so on serverless fan-out it yields
 * the cap once per warm instance and resets on every cold start — no bound at all for
 * the one unauthenticated, service-role write in the app. Counting the rows already
 * being inserted is the only limiter that holds across instances, and it needs no new
 * table to do it.
 */
const SUBMISSION_WINDOW_MS = 60 * 60 * 1000
const MAX_SUBMISSIONS_PER_WINDOW = 30

/** Whether this link has already submitted its hourly allowance. */
export async function hasExceededSubmissionRate(tokenId: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient()
  const since = new Date(Date.now() - SUBMISSION_WINDOW_MS).toISOString()

  const { count, error } = await supabase
    .from('client_ideas')
    .select('id', { count: 'exact', head: true })
    .eq('token_id', tokenId)
    .gte('submitted_at', since)

  // Fail closed. A limiter that waves everything through when its own query breaks is
  // not a limiter, and this guards the only unauthenticated write in the app.
  if (error) throw new Error(`hasExceededSubmissionRate failed: ${error.message}`)

  return (count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW
}

/**
 * Inserts the ideas a client submitted, one row per distinct idea.
 *
 * Deduplicated on the idea text because the form makes it easy to send the same thing
 * twice — "Add another idea" clones an empty card, and a client who is unsure whether
 * the first one registered fills in the second the same way. Two identical rows are
 * two inbox entries an agency has to dismiss separately, and two `brief_index` slots
 * competing for the same source if both are generated from.
 *
 * Compared case- and whitespace-insensitively on the idea text alone: the notes and
 * platform are refinements of the same request, and the first occurrence keeps them.
 */
export async function submitIdeas(
  tokenId: string,
  agencyId: string,
  clientId: string,
  ideas: IdeaBrief[]
): Promise<void> {
  const supabase = createAdminSupabaseClient()

  const seen = new Set<string>()
  const distinct = ideas.filter((idea) => {
    const key = idea.ideaText.trim().toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const { error } = await supabase.from('client_ideas').insert(
    distinct.map((i) => ({
      agency_id: agencyId,
      client_id: clientId,
      token_id: tokenId,
      idea_text: i.ideaText,
      extra_notes: i.extraNotes || null,
      platform: i.platform || null,
      target_date: i.targetDate || null,
    }))
  )

  if (error) throw new Error(`Failed to submit ideas: ${error.message}`)
}

// ── Dashboard queries (admin client — RLS is service-role only) ──

/**
 * Fetches ideas for the agency with optional filters.
 *
 * `statuses` is a list rather than one value because a tab is a population, not a status —
 * see `idea-filters.ts`. Passing `null` or omitting it means no status filter at all.
 */
export async function fetchIdeasForAgency(
  agencyId: string,
  filters?: { clientId?: string; statuses?: readonly IdeaStatus[] | null; limit?: number }
): Promise<ClientIdea[]> {
  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('client_ideas')
    .select(`${CLIENT_IDEA_COLUMNS}, clients(name, niche)`)
    .eq('agency_id', agencyId)
    .order('submitted_at', { ascending: false })

  if (filters?.clientId) query = query.eq('client_id', filters.clientId)
  if (filters?.statuses) query = query.in('status', [...filters.statuses])
  if (filters?.limit) query = query.limit(filters.limit)

  const data = unwrap(await query, 'fetchIdeasForAgency')

  return (data ?? []).map(mapIdeaRow)
}

/**
 * Moves ideas to a new status.
 *
 * Takes a list because dismissing one row and dismissing a selection are the same write; a
 * separate single-id path would be a second place for the agency scope to be forgotten.
 */
export async function setIdeasStatus(
  ideaIds: string[],
  agencyId: string,
  status: IdeaStatus
): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('client_ideas')
    .update({ status })
    .in('id', ideaIds)
    .eq('agency_id', agencyId)

  if (error) throw new Error(`Failed to update ideas: ${error.message}`)
}

/** Records the post that fulfils an idea, and marks the idea generated in the same write. */
export async function linkIdeaToPost(
  ideaId: string,
  agencyId: string,
  postId: string
): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('client_ideas')
    .update({ status: 'generated', generated_post_id: postId })
    .eq('id', ideaId)
    .eq('agency_id', agencyId)

  if (error) throw new Error(`Failed to link idea to post: ${error.message}`)
}

/** Marks ideas as read by setting read_at on unread rows. */
export async function markIdeasRead(agencyId: string, ideaIds: string[]): Promise<void> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('client_ideas')
    .update({ read_at: new Date().toISOString() })
    .in('id', ideaIds)
    .eq('agency_id', agencyId)
    .is('read_at', null)

  if (error) throw new Error(`Failed to mark ideas read: ${error.message}`)
}

/**
 * Fetches a single idea by ID (for generate wizard pre-fill), or null if the agency
 * has no such idea.
 *
 * maybeSingle so "not found" and "the query failed" stay different answers — this
 * returned null for both, which rendered a database outage as a missing idea.
 */
export async function fetchIdeaById(ideaId: string, agencyId: string): Promise<ClientIdea | null> {
  const supabase = createAdminSupabaseClient()
  const data = unwrap(
    await supabase
      .from('client_ideas')
      .select(`${CLIENT_IDEA_COLUMNS}, clients(name, niche)`)
      .eq('id', ideaId)
      .eq('agency_id', agencyId)
      .maybeSingle(),
    'fetchIdeaById'
  )

  return data ? mapIdeaRow(data) : null
}

// ── Row mapper ──────────────────────────────────────────────

// Supabase returns untyped rows from joined queries — assertions match the select + join shape
function mapIdeaRow(row: Record<string, unknown>): ClientIdea {
  const clients = row.clients as { name: string; niche: string | null } | null
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: formatClientName(clients?.name),
    clientNiche: clients?.niche ?? null,
    ideaText: row.idea_text as string,
    extraNotes: (row.extra_notes as string | null) ?? null,
    platform: (row.platform as string | null) ?? null,
    targetDate: (row.target_date as string | null) ?? null,
    status: row.status as IdeaStatus,
    generatedPostId: (row.generated_post_id as string | null) ?? null,
    submittedAt: row.submitted_at as string,
    readAt: (row.read_at as string | null) ?? null,
  }
}
