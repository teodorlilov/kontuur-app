/**
 * Reusable Supabase read-query helpers.
 *
 * Rules:
 * - Read queries only — no INSERT/UPDATE/DELETE.
 * - Every function accepts a supabase client as first argument so callers
 *   can pass either the server or admin client as needed.
 * - Functions return typed values, never raw Supabase response objects.
 * - Narrow auth checks ('id', 'agency_id' only) stay inline at call sites.
 * - Add a function here when the same query pattern appears in 2+ files.
 * - If you add/remove a column, update select-columns.ts first, then this file.
 *
 * WHY the `as` casts throughout: each query projects an explicit column list from
 * select-columns.ts, so the row shape is known here but not inferable — Supabase
 * types the result from the table, not from the projection string.
 */

import {
  CLIENT_COLUMNS,
  AGENCY_SETTINGS_COLUMNS,
  BRAND_PROFILE_COLUMNS,
  POSTING_SCHEDULE_COLUMNS,
  USER_COLUMNS,
  SOCIAL_CONNECTION_COLUMNS,
  LANGUAGE_RULES_COLUMNS,
  POST_HISTORY_COLUMNS,
  CLIENT_SOURCE_RESEARCH_COLUMNS,
  CLIENT_SOURCE_SUMMARY_COLUMNS,
  EXEMPLAR_COLUMNS,
} from '@/lib/queries/select-columns'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { parseMemoBullets } from '@/lib/learning/style-memo'
import { unwrap } from '@/lib/queries/unwrap'
import type { AgencyInfo, TeamMember, MetaConnection } from '@/types/api'
import type { ClientRow, BrandProfileRow, PostingScheduleRow, LanguageRuleRow, Json } from '@/types'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

// ---------- clients ----------

/**
 * Fetches a single client by id, verifying agency ownership in the same query.
 * Returns null if not found or not owned by agencyId.
 */
export async function fetchClientById(
  supabase: SupabaseClient,
  clientId: string,
  agencyId: string
): Promise<Omit<ClientRow, 'agency_id'> | null> {
  const data = unwrap(
    await supabase
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('id', clientId)
      .eq('agency_id', agencyId)
      .maybeSingle(),
    'fetchClientById'
  )
  return data as Omit<ClientRow, 'agency_id'> | null
}

// ---------- brand_profiles ----------

/**
 * Fetches the full brand profile for a client.
 * No ownership check — callers must have already verified client ownership.
 */
export async function fetchBrandProfileByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<Omit<BrandProfileRow, 'client_id'> | null> {
  const data = unwrap(
    await supabase
      .from('brand_profiles')
      .select(BRAND_PROFILE_COLUMNS)
      .eq('client_id', clientId)
      .maybeSingle(),
    'fetchBrandProfileByClient'
  )
  return data as Omit<BrandProfileRow, 'client_id'> | null
}

// ---------- posting_schedules ----------

/**
 * Fetches the posting schedule for a client.
 * No ownership check — callers must have already verified client ownership.
 */
export async function fetchPostingScheduleByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null> {
  const data = unwrap(
    await supabase
      .from('posting_schedules')
      .select(POSTING_SCHEDULE_COLUMNS)
      .eq('client_id', clientId)
      .maybeSingle(),
    'fetchPostingScheduleByClient'
  )
  return data as Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null
}

// ---------- agencies ----------

/**
 * Fetches agency settings columns for the given agency id (non-cached).
 * Use getCachedAgency() from src/lib/queries/cache.ts for read-only pages
 * where a 60-second staleness window is acceptable.
 * Use this function in API routes that need fresh data after a PUT.
 */
export async function fetchAgencyById(
  supabase: SupabaseClient,
  agencyId: string
): Promise<AgencyInfo | null> {
  const data = unwrap(
    await supabase
      .from('agencies')
      .select(AGENCY_SETTINGS_COLUMNS)
      .eq('id', agencyId)
      .maybeSingle(),
    'fetchAgencyById'
  )
  return data as AgencyInfo | null
}

// ---------- users ----------

/**
 * Every member of the given agency, oldest first. The one reader of "who is on this team".
 *
 * ADMIN CLIENT, DELIBERATELY. `users_self_access` is `id = auth.uid()`, so a user-scoped read of
 * this table can only ever return ONE row — the caller's own. This took the user-scoped client, so
 * the settings Team tab listed exactly one person in every multi-person agency and the header read
 * "1 member" forever; because `MemberRow` gates Remove on `!isCurrentUser`, `removeTeamMember` could
 * not be reached from the UI at all. One tab away, the Integrations panel read the same table
 * through the admin client and listed everyone — the same page rendering a 1-person and an N-person
 * workspace at once.
 *
 * Takes `agencyId` rather than a client, unlike the rest of this file, because the caller does not
 * get to choose the scope: the ownership check is the caller's `agencyId` itself.
 */
export async function fetchTeamMembersByAgency(agencyId: string): Promise<TeamMember[]> {
  const data = unwrap(
    await createAdminSupabaseClient()
      .from('users')
      .select(USER_COLUMNS)
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true }),
    'fetchTeamMembersByAgency'
  )
  // as: the shared SupabaseClient param is untyped, so USER_COLUMNS does not infer. Safe now that
  // TeamMember is Pick<UserRow, …> — it used to declare created_at non-null over a nullable column,
  // and this cast was the only thing standing between that and the render.
  return (data ?? []) as TeamMember[]
}

// ---------- social_connections ----------

/**
 * Fetches all social connections for a client, ordered by created_at ascending.
 * No ownership check — callers must have already verified client ownership.
 */
export async function fetchConnectionsByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<MetaConnection[]> {
  const data = unwrap(
    await supabase
      .from('social_connections')
      .select(SOCIAL_CONNECTION_COLUMNS)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true }),
    'fetchConnectionsByClient'
  )
  return (data ?? []) as MetaConnection[]
}

/** One client's Instagram connection, as everything downstream of it needs it. */
export interface IgConnectionState {
  accountId: string | null
  /** End of the last metrics sync ATTEMPT (migration 20260828), clean or not. */
  lastSyncAt: string | null
  /** Null after a run that completed every phase; the failing phases otherwise. */
  lastSyncError: string | null
}

/**
 * The Instagram connection this client is on RIGHT NOW — the account id every
 * analytics read scopes its rows by, plus the cron's verdict on the last run.
 *
 * Six call sites had each grown a copy of this query and disagreed three ways:
 * `.eq` vs `.ilike` on a column thirteen other sites prove is lowercase, and
 * `.maybeSingle()` without `.limit(1)`, which THROWS on a duplicate row instead
 * of picking one. Two also dropped the error, so an outage read as "no Instagram
 * connected". Callers that want only the account id destructure only that — one
 * row either way, and one shape to keep true.
 */
export async function fetchIgConnectionState(
  supabase: SupabaseClient,
  clientId: string
): Promise<IgConnectionState> {
  const data = unwrap(
    await supabase
      .from('social_connections')
      .select('account_id, last_sync_at, last_sync_error')
      .eq('client_id', clientId)
      .eq('platform', 'instagram')
      .limit(1)
      .maybeSingle(),
    'fetchIgConnectionState'
  )
  // No cast: a literal select string over columns the generated types know does
  // infer. The `as` this file warns about is for projections built from arrays.
  return {
    accountId: data?.account_id ?? null,
    lastSyncAt: data?.last_sync_at ?? null,
    lastSyncError: data?.last_sync_error ?? null,
  }
}

// ---------- language_rules ----------

type LanguageRulesRow = Pick<
  LanguageRuleRow,
  'native_cta_phrases' | 'formality_rules' | 'language_instructions'
>

/**
 * Fetches language rules for a given language name (e.g. "English", "Bulgarian").
 * Returns null when no row exists for that language.
 *
 * Used in:
 *   src/ai/research/research-orchestrator.ts (fetchClientProfile DB fallback)
 *   src/lib/clients/fetch-client-data.ts
 */
export async function fetchLanguageRulesByLanguage(
  supabase: SupabaseClient,
  language: string
): Promise<LanguageRulesRow | null> {
  const data = unwrap(
    await supabase
      .from('language_rules')
      .select(LANGUAGE_RULES_COLUMNS)
      .eq('language', language)
      .maybeSingle(),
    'fetchLanguageRulesByLanguage'
  )
  return data as LanguageRulesRow | null
}

// ---------- posts ----------

// ---------- post_history ----------

/**
 * Fetches recent post history summaries for a client, ordered newest first.
 * Returns a flat string array (topic_summary values).
 *
 * Used in:
 *   src/app/(dashboard)/generate/page.tsx (server-side prefetch)
 */
export async function fetchPostHistoryByClient(
  supabase: SupabaseClient,
  clientId: string,
  limit = 30
): Promise<string[]> {
  const data = unwrap(
    await supabase
      .from('post_history')
      .select(POST_HISTORY_COLUMNS)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit),
    'fetchPostHistoryByClient'
  )
  return (
    (data as Array<{ topic_summary: string | null }> | null)
      ?.map((h) => h.topic_summary)
      .filter((s): s is string => s !== null) ?? []
  )
}

/**
 * Counts posts with status='pending_review' across the given client ids.
 * Returns 0 immediately when clientIds is empty (avoids an unnecessary DB call).
 */
export async function countPendingPostsByClients(
  supabase: SupabaseClient,
  clientIds: string[]
): Promise<number> {
  if (clientIds.length === 0) return 0
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review')
    .in('client_id', clientIds)
  if (error) throw new Error(`countPendingPostsByClients failed: ${error.message}`)
  return count ?? 0
}

// ---------- client_sources ----------

export interface ClientSourceRow {
  id: string
  type: string
  label: string
  url: string
  config: Record<string, unknown>
  pillar_ids: string[]
  extracted_text: string | null
}

/**
 * Fetches active client sources for the research pipeline.
 * Returns only the columns needed for source fetching (id, type, label, url, config, extracted_text).
 *
 * Used in:
 *   src/ai/research/research-orchestrator.ts
 */
export async function fetchClientSources(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientSourceRow[]> {
  const data = unwrap(
    await supabase
      .from('client_sources')
      .select(CLIENT_SOURCE_RESEARCH_COLUMNS)
      .eq('client_id', clientId)
      .eq('is_active', true),
    'fetchClientSources'
  )
  return (data as ClientSourceRow[] | null) ?? []
}

/** An active source as the generate flow's run-plan preview consumes it. */
export interface ClientSourceSummary {
  id: string
  type: string
  label: string
  url: string | null
  pillar_ids: string[] | null
}

/**
 * Fetches active client sources without the heavy research columns
 * (extracted_text, config). Feeds the pre-run content-mix preview in
 * the generate flow — same is_active filter as fetchClientSources, so
 * the preview sees exactly the sources the research pipeline will.
 */
export async function fetchClientSourceSummaries(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientSourceSummary[]> {
  const data = unwrap(
    await supabase
      .from('client_sources')
      .select(CLIENT_SOURCE_SUMMARY_COLUMNS)
      .eq('client_id', clientId)
      .eq('is_active', true),
    'fetchClientSourceSummaries'
  )
  return (data as ClientSourceSummary[] | null) ?? []
}

/**
 * Fetches source URLs from recent posts for a client.
 * Used to exclude already-used articles from Tavily search results
 * and from the research LLM prompt.
 *
 * Used in:
 *   src/ai/research/research-orchestrator.ts
 */
export async function fetchUsedSourceUrls(
  supabase: SupabaseClient,
  clientId: string,
  limit = 50
): Promise<string[]> {
  const data = unwrap(
    await supabase
      .from('posts')
      .select('source_url')
      .eq('client_id', clientId)
      .not('source_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    'fetchUsedSourceUrls'
  )
  return (
    (data as Array<{ source_url: string | null }> | null)
      ?.map((r) => r.source_url)
      .filter((u): u is string => u !== null) ?? []
  )
}

// ---------- source usage stats (outcome telemetry) ----------

export interface SourceUsageStats {
  clientSourceId: string
  approvedCount: number
  discardedCount: number
}

/**
 * Per-source outcome counts for a client: posts fueled (any post row past
 * pending_review) and drafts discarded. Powers the "Fueled N posts" surface
 * and the rank-stage approval boost.
 *
 * Used in:
 *   src/app/(dashboard)/clients/[id]/sources/page.tsx
 *   src/ai/research/research-orchestrator.ts
 */
export async function fetchSourceUsageStats(
  supabase: SupabaseClient,
  clientId: string
): Promise<SourceUsageStats[]> {
  const [postsRes, discardsRes] = await Promise.all([
    supabase
      .from('posts')
      .select('client_source_id, status')
      .eq('client_id', clientId)
      .not('client_source_id', 'is', null),
    supabase.from('discarded_drafts').select('client_source_id').eq('client_id', clientId),
  ])

  const posts = unwrap(postsRes, 'fetchSourceUsageStats(posts)')
  const discards = unwrap(discardsRes, 'fetchSourceUsageStats(discards)')

  const stats = new Map<string, SourceUsageStats>()
  const get = (id: string): SourceUsageStats => {
    const existing = stats.get(id)
    if (existing) return existing
    const fresh = { clientSourceId: id, approvedCount: 0, discardedCount: 0 }
    stats.set(id, fresh)
    return fresh
  }

  for (const row of posts ?? []) {
    // pending_review cron drafts are not yet a human signal
    if (row.client_source_id && row.status !== 'pending_review') {
      get(row.client_source_id).approvedCount++
    }
  }

  for (const row of discards ?? []) {
    if (row.client_source_id) get(row.client_source_id).discardedCount++
  }

  return [...stats.values()]
}

/** Approved voice for the writer's prompt, split per format. */
export interface ClientExemplars {
  single: string[]
  carousel: Array<{ caption: string; coverHeadline: string }>
}

/**
 * Per-client context the engine attaches at generation time only — never part
 * of the browser round-trip (the wizard's clientDataSchema would silently strip
 * unknown keys, so ride-along fields diverge between paths).
 */
interface EngineContext {
  exemplars: ClientExemplars
  /** Distilled review-correction rules; [] until the distiller has learned any. */
  styleMemo: string[]
}

// Exemplar bounds: enough voice to imitate without bloating the cached prompt
// prefix; captions outside the band are either too thin to carry style or too
// long to be representative.
const EXEMPLAR_SINGLE_LIMIT = 3
const EXEMPLAR_CAROUSEL_LIMIT = 2
const EXEMPLAR_MIN_CHARS = 80
const EXEMPLAR_MAX_CHARS = 1200

/**
 * The engine's per-client generation context: recently approved posts as voice
 * exemplars. Distinct from `post_history` (topic_summary only, for topic dedup)
 * and from the IG performance source (engagement-ranked public captions for
 * research) — this is approved caption TEXT, for the writer to imitate.
 *
 * Human-edited posts rank first: `caption` on an edited row is the reviewer's
 * corrected text, the closest thing to ground truth on this client's voice.
 *
 * Used in:
 *   src/app/api/ai/generate-stream/route.ts
 *   src/app/api/cron/generate/route.ts
 */
export async function fetchEngineContext(
  supabase: SupabaseClient,
  clientId: string
): Promise<EngineContext> {
  const [exemplarResult, memoResult] = await Promise.all([
    supabase
      .from('posts')
      .select(EXEMPLAR_COLUMNS)
      .eq('client_id', clientId)
      // Everything past review counts — publish transit or failure does not
      // un-approve the copy, and excluding those states would churn the cached
      // prompt prefix as posts move through publishing.
      .in('status', ['approved', 'scheduled', 'publishing', 'published', 'failed'])
      .order('edited_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(24),
    // The memo table is service-role-only (RLS, no policies) — read it through
    // the admin client regardless of the caller's client, or the manual path
    // (user-scoped supabase) would silently lose the memo while cron kept it.
    createAdminSupabaseClient()
      .from('client_style_memos')
      .select('memo')
      .eq('client_id', clientId)
      .maybeSingle(),
  ])
  const data = unwrap(exemplarResult, 'fetchEngineContext')

  // The memo is an enrichment, not a requirement: a failed read must not sink
  // the run. But it must not vanish silently either — an unlogged failure is
  // indistinguishable from "the distiller has not learned anything yet".
  if (memoResult.error) {
    console.error('[engine] style memo read failed:', memoResult.error)
  }
  // as: maybeSingle() over a projected column set, narrowed to what we read.
  const styleMemo = parseMemoBullets((memoResult.data as { memo?: Json } | null)?.memo ?? null).map(
    (b) => b.rule
  )

  // as: explicit column projection — the generated row type covers the whole
  // table, not the three columns EXEMPLAR_COLUMNS selects.
  const rows = (data ?? []) as Array<{
    caption: string | null
    slides_json: unknown
    post_type: string
  }>

  const single: string[] = []
  const carousel: Array<{ caption: string; coverHeadline: string }> = []
  for (const row of rows) {
    const caption = row.caption?.trim() ?? ''
    if (caption.length < EXEMPLAR_MIN_CHARS || caption.length > EXEMPLAR_MAX_CHARS) continue
    if (row.post_type === 'carousel') {
      if (carousel.length >= EXEMPLAR_CAROUSEL_LIMIT) continue
      const slides = Array.isArray(row.slides_json)
        ? (row.slides_json as Array<{ headline?: unknown }>)
        : []
      const coverHeadline = typeof slides[0]?.headline === 'string' ? slides[0].headline : ''
      carousel.push({ caption, coverHeadline })
    } else {
      if (single.length >= EXEMPLAR_SINGLE_LIMIT) continue
      single.push(caption)
    }
  }
  return { exemplars: { single, carousel }, styleMemo }
}

/**
 * Counts the client's recent posts per pillar — feeds deficit-aware pillar
 * allocation so small generation batches rotate through pillars over time.
 *
 * Used in:
 *   src/ai/research/research-orchestrator.ts
 */
export async function fetchRecentPillarCounts(
  supabase: SupabaseClient,
  clientId: string,
  limit = 30
): Promise<Map<string, number>> {
  const data = unwrap(
    await supabase
      .from('posts')
      .select('pillar')
      .eq('client_id', clientId)
      .not('pillar', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    'fetchRecentPillarCounts'
  )

  const counts = new Map<string, number>()
  for (const row of (data as Array<{ pillar: string | null }> | null) ?? []) {
    if (row.pillar) counts.set(row.pillar, (counts.get(row.pillar) ?? 0) + 1)
  }
  return counts
}
