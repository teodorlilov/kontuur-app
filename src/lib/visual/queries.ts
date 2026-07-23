import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type { ExtractionReport, SourceKind, VisualIdentity } from '@/types/visual'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import {
  BRAND_KIT_EXTRACTION_COLUMNS,
  BRAND_VISUAL_IDENTITY_COLUMNS,
} from '@/lib/queries/select-columns'
import { safeParseVisualIdentity } from './identity-schema'
import { buildDefaultIdentity } from './identity'

type Db = SupabaseClient<Database>

// jsonb columns accept validated blobs; TS can't structurally prove our domain types are `Json`, so we
// cast at the single write boundary (identity is zod-validated before this; report is app-produced).
const asJson = (v: unknown): Json => v as Json

/**
 * Fetch a client's stored visual identity, or null when absent/invalid. Uses the admin client because
 * `brand_visual_identity` has RLS (like `post_images`) — callers verify agency ownership first.
 */
export async function fetchVisualIdentity(clientId: string): Promise<VisualIdentity | null> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('brand_visual_identity')
    .select(BRAND_VISUAL_IDENTITY_COLUMNS)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !data) return null
  const parsed = safeParseVisualIdentity(data.identity)
  return parsed.success ? parsed.identity : null
}

/** A client's identity with the neutral default as fallback — for read paths that must never fail. */
export async function fetchVisualIdentityOrDefault(clientId: string): Promise<VisualIdentity> {
  return (await fetchVisualIdentity(clientId)) ?? buildDefaultIdentity()
}

/** Validate then upsert a client's visual identity (1:1 on client_id). Admin client (RLS); callers verify
 *  ownership first. Returns an error string on failure. */
export async function upsertVisualIdentity(
  clientId: string,
  identity: VisualIdentity,
  sourceKind: SourceKind,
  report?: ExtractionReport
): Promise<{ error?: string }> {
  const parsed = safeParseVisualIdentity(identity)
  if (!parsed.success) return { error: `Invalid visual identity: ${parsed.issues.join('; ')}` }

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('brand_visual_identity').upsert(
    {
      client_id: clientId,
      identity: asJson(parsed.identity),
      source_kind: sourceKind,
      report: report ? asJson(report) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  )
  return error ? { error: error.message } : {}
}

/** Validate then update ONLY the identity blob for a client, leaving `source_kind`/`report` untouched
 *  (used by the palette-description self-heal). No-op when the client has no identity row yet. */
export async function updateVisualIdentityBlob(
  clientId: string,
  identity: VisualIdentity
): Promise<{ error?: string }> {
  const parsed = safeParseVisualIdentity(identity)
  if (!parsed.success) return { error: `Invalid visual identity: ${parsed.issues.join('; ')}` }

  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('brand_visual_identity')
    .update({ identity: asJson(parsed.identity), updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
  return error ? { error: error.message } : {}
}

export type ExtractionSession = {
  status: string
  identity: VisualIdentity | null
  report: ExtractionReport | null
}

/** Fetch an onboarding extraction session's status + result, or null when absent. */
export async function fetchExtraction(supabase: Db, sessionId: string): Promise<ExtractionSession | null> {
  const { data, error } = await supabase
    .from('brand_kit_extractions')
    .select(BRAND_KIT_EXTRACTION_COLUMNS)
    .eq('onboarding_session_id', sessionId)
    .maybeSingle()
  if (error || !data) return null
  const parsed = data.identity ? safeParseVisualIdentity(data.identity) : null
  return {
    status: data.status,
    identity: parsed?.success ? parsed.identity : null,
    // report is app-produced JSON we wrote; safe to surface as-is.
    report: (data.report as ExtractionReport | null) ?? null,
  }
}

export type ExtractionPatch = {
  status: 'pending' | 'ready' | 'fallback' | 'failed'
  agencyId?: string | null
  identity?: VisualIdentity | null
  report?: ExtractionReport | null
}

/** Upsert an onboarding extraction session row (1:1 on onboarding_session_id). Only sends the columns
 *  actually being written — a status-only "pending" write never references `identity`/`report`. */
export async function writeExtraction(
  supabase: Db,
  sessionId: string,
  patch: ExtractionPatch
): Promise<{ error?: string }> {
  const row: Database['public']['Tables']['brand_kit_extractions']['Insert'] = {
    onboarding_session_id: sessionId,
    agency_id: patch.agencyId ?? null,
    status: patch.status,
    updated_at: new Date().toISOString(),
  }
  if (patch.identity != null) row.identity = asJson(patch.identity)
  if (patch.report != null) row.report = asJson(patch.report)

  const { error } = await supabase
    .from('brand_kit_extractions')
    .upsert(row, { onConflict: 'onboarding_session_id' })
  return error ? { error: error.message } : {}
}
