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
} from '@/lib/queries/select-columns'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { TeamMember, MetaConnection } from '@/types/api'
import type { ClientRow, BrandProfileRow, PostingScheduleRow } from '@/types/database'

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
  return (data as Omit<ClientRow, 'agency_id'> | null)
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
  return (data as Omit<BrandProfileRow, 'client_id'> | null)
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
  return (data as Omit<PostingScheduleRow, 'client_id' | 'created_at'> | null)
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
  return (data as AgencySettings | null)
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
  native_cta_phrases: unknown | null
  formality_rules: unknown | null
  language_instructions: string | null
}

/**
 * Fetches language rules for a given language name (e.g. "English", "Bulgarian").
 * Returns null when no row exists for that language.
 *
 * Used in:
 *   src/ai/research/pipeline.ts (fetchClientProfile DB fallback)
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
  return (data as LanguageRulesRow | null)
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
  return (data as Array<{ topic_summary: string | null }> | null)
    ?.map((h) => h.topic_summary)
    .filter((s): s is string => s !== null) ?? []
}

// ---------- posts ----------

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
  return (data as Array<{ caption: string | null }> | null)
    ?.map((p) => (p.caption ?? '').slice(0, 120))
    .filter(Boolean) ?? []
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
