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
  TOP_POSTS_COLUMNS,
  CLIENT_SOURCE_RESEARCH_COLUMNS,
} from '@/lib/queries/select-columns'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { TeamMember, MetaConnection } from '@/types/api'
import type { ClientRow, BrandProfileRow, PostingScheduleRow, Json } from '@/types'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export type AgencySettings = {
  id: string
  name: string
  plan: string
  mode: string
  subscription_status: string
  trial_ends_at: string
  plan_client_limit: number
  timezone: string | null
}

// ---------- clients ----------

/**
 * Fetches a single client by id, verifying agency ownership in the same query.
 * Returns null if not found or not owned by agencyId.
 *
 * Replaces inline queries in:
 *   src/app/api/clients/[id]/route.ts
 *   src/app/(dashboard)/clients/[id]/edit/page.tsx
 *   src/app/(dashboard)/clients/[id]/sources/page.tsx
 */
export async function fetchClientById(
  supabase: SupabaseClient,
  clientId: string,
  agencyId: string
): Promise<Omit<ClientRow, 'agency_id'> | null> {
  const { data } = await supabase
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .single()
  return data as Omit<ClientRow, 'agency_id'> | null
}

// ---------- brand_profiles ----------

/**
 * Fetches the full brand profile for a client.
 * No ownership check — callers must have already verified client ownership.
 *
 * Replaces inline queries in:
 *   src/app/api/clients/[id]/route.ts
 *   src/app/(dashboard)/clients/[id]/edit/page.tsx
 */
export async function fetchBrandProfileByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<Omit<BrandProfileRow, 'client_id'> | null> {
  const { data } = await supabase
    .from('brand_profiles')
    .select(BRAND_PROFILE_COLUMNS)
    .eq('client_id', clientId)
    .single()
  return data as Omit<BrandProfileRow, 'client_id'> | null
}

// ---------- posting_schedules ----------

/**
 * Fetches the posting schedule for a client.
 * No ownership check — callers must have already verified client ownership.
 *
 * Replaces inline queries in:
 *   src/app/api/clients/[id]/route.ts
 *   src/app/(dashboard)/clients/[id]/edit/page.tsx
 */
export async function fetchPostingScheduleByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null> {
  const { data } = await supabase
    .from('posting_schedules')
    .select(POSTING_SCHEDULE_COLUMNS)
    .eq('client_id', clientId)
    .single()
  return data as Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null
}

// ---------- agencies ----------

/**
 * Fetches agency settings columns for the given agency id (non-cached).
 * Use getCachedAgency() from src/lib/queries/cache.ts for read-only pages
 * where a 60-second staleness window is acceptable.
 * Use this function in API routes that need fresh data after a PUT.
 *
 * Replaces inline queries in:
 *   src/app/api/settings/account/route.ts
 *   src/app/(dashboard)/settings/account/page.tsx
 */
export async function fetchAgencyById(
  supabase: SupabaseClient,
  agencyId: string
): Promise<AgencySettings | null> {
  const { data } = await supabase
    .from('agencies')
    .select(AGENCY_SETTINGS_COLUMNS)
    .eq('id', agencyId)
    .single()
  return data as AgencySettings | null
}

// ---------- users ----------

/**
 * Fetches all team members for the given agency, ordered by created_at ascending.
 *
 * Replaces inline queries in:
 *   src/app/api/settings/team/route.ts
 *   src/app/(dashboard)/settings/team/page.tsx
 */
export async function fetchTeamMembersByAgency(
  supabase: SupabaseClient,
  agencyId: string
): Promise<TeamMember[]> {
  const { data } = await supabase
    .from('users')
    .select(USER_COLUMNS)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })
  return (data ?? []) as TeamMember[]
}

// ---------- social_connections ----------

/**
 * Fetches all social connections for a client, ordered by created_at ascending.
 * No ownership check — callers must have already verified client ownership.
 *
 * Replaces inline queries in:
 *   src/app/api/meta/connections/route.ts
 *   src/app/(dashboard)/analytics/page.tsx
 */
export async function fetchConnectionsByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<MetaConnection[]> {
  const { data } = await supabase
    .from('social_connections')
    .select(SOCIAL_CONNECTION_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  return (data ?? []) as MetaConnection[]
}

// ---------- language_rules ----------

export type LanguageRulesRow = {
  native_cta_phrases: Json | null
  formality_rules: Json | null
  language_instructions: string | null
}

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
  const { data } = await supabase
    .from('language_rules')
    .select(LANGUAGE_RULES_COLUMNS)
    .eq('language', language)
    .single()
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
  const { data } = await supabase
    .from('post_history')
    .select(POST_HISTORY_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (
    (data as Array<{ topic_summary: string | null }> | null)
      ?.map((h) => h.topic_summary)
      .filter((s): s is string => s !== null) ?? []
  )
}

/**
 * Fetches captions of top-performing approved posts for a client (quality_score_avg >= 7.5).
 * Returns a flat string array of truncated captions (first 120 chars each).
 *
 * Used in:
 *   src/app/(dashboard)/generate/page.tsx (server-side prefetch)
 */
export async function fetchTopPostsByClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('posts')
    .select(TOP_POSTS_COLUMNS)
    .eq('client_id', clientId)
    .eq('status', 'approved')
    .gte('quality_score_avg', 7.5)
    .order('quality_score_avg', { ascending: false })
    .limit(20)
  return (
    (data as Array<{ caption: string | null }> | null)
      ?.map((p) => (p.caption ?? '').slice(0, 120))
      .filter(Boolean) ?? []
  )
}

/**
 * Counts posts with status='pending_review' across the given client ids.
 * Returns 0 immediately when clientIds is empty (avoids an unnecessary DB call).
 *
 * Replaces inline queries in:
 *   src/app/(dashboard)/layout.tsx
 *   src/app/(dashboard)/dashboard/page.tsx
 */
export async function countPendingPostsByClients(
  supabase: SupabaseClient,
  clientIds: string[]
): Promise<number> {
  if (clientIds.length === 0) return 0
  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_review')
    .in('client_id', clientIds)
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
  const { data } = await supabase
    .from('client_sources')
    .select(CLIENT_SOURCE_RESEARCH_COLUMNS)
    .eq('client_id', clientId)
    .eq('is_active', true)
  return (data as ClientSourceRow[] | null) ?? []
}

// ---------- generation_runs / generation_themes ----------

/**
 * Fetches theme descriptions from recent generation runs for a client.
 * Used to extend post history so the research pipeline avoids re-suggesting
 * themes that were already generated (but not yet in post_history).
 *
 * Used in:
 *   src/ai/research/research-orchestrator.ts
 */
export async function fetchThemeDescriptions(
  supabase: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<string[]> {
  const { data } = await supabase
    .from('generation_runs')
    .select('generation_themes(theme_description)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = data as Array<{
    generation_themes: Array<{ theme_description: string | null }>
  }> | null
  return (rows ?? []).flatMap((run) =>
    run.generation_themes.map((t) => t.theme_description).filter((t): t is string => t !== null)
  )
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
  const { data } = await supabase
    .from('posts')
    .select('source_url')
    .eq('client_id', clientId)
    .not('source_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as Array<{ source_url: string | null }> | null)
    ?.map((r) => r.source_url)
    .filter((u): u is string => u !== null) ?? []
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
  // Cast to untyped client — client_source_id/discarded_drafts added by
  // migration 20260729, not yet in generated Supabase types
  const untyped = supabase as unknown as import('@supabase/supabase-js').SupabaseClient
  const [postsRes, discardsRes] = await Promise.all([
    untyped
      .from('posts')
      .select('client_source_id, status')
      .eq('client_id', clientId)
      .not('client_source_id', 'is', null),
    untyped.from('discarded_drafts').select('client_source_id').eq('client_id', clientId),
  ])

  const stats = new Map<string, SourceUsageStats>()
  const get = (id: string): SourceUsageStats => {
    const existing = stats.get(id)
    if (existing) return existing
    const fresh = { clientSourceId: id, approvedCount: 0, discardedCount: 0 }
    stats.set(id, fresh)
    return fresh
  }

  const postRows =
    (postsRes.data as unknown as Array<{ client_source_id: string | null; status: string }> | null) ?? []
  for (const row of postRows) {
    // pending_review cron drafts are not yet a human signal
    if (row.client_source_id && row.status !== 'pending_review') {
      get(row.client_source_id).approvedCount++
    }
  }

  const discardRows =
    (discardsRes.data as unknown as Array<{ client_source_id: string | null }> | null) ?? []
  for (const row of discardRows) {
    if (row.client_source_id) get(row.client_source_id).discardedCount++
  }

  return [...stats.values()]
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
  const { data } = await supabase
    .from('posts')
    .select('pillar')
    .eq('client_id', clientId)
    .not('pillar', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  const counts = new Map<string, number>()
  for (const row of (data as Array<{ pillar: string | null }> | null) ?? []) {
    if (row.pillar) counts.set(row.pillar, (counts.get(row.pillar) ?? 0) + 1)
  }
  return counts
}
