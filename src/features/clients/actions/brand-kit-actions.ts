'use server'

import { requireSessionUser } from '@/lib/auth/session'
import { safeParseBrandTokens } from '@/lib/brand-kit/tokens-schema'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { BrandTokens } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'

/**
 * Persist a client's brand kit + feed-system choice (§3.1/§3.3). Validates the tokens (zod), verifies
 * agency ownership, upserts the kit and bumps `version` (which dirties the Phase-0 render hashes for the
 * Phase-7 re-render engine), and sets the default feed system. Re-render on save is Phase 7 — not fired
 * here.
 */
export async function saveBrandKit(
  clientId: string,
  tokens: BrandTokens,
  feedSystemSlug: string | null,
  brief?: BrandBrief | null
): Promise<{ ok: boolean; error?: string }> {
  const { agencyId } = await requireSessionUser()

  const parsed = safeParseBrandTokens(tokens)
  if (!parsed.success) return { ok: false, error: parsed.issues.join('; ') }

  const admin = createUntypedAdminClient()
  const { data: owned } = await admin
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!owned) return { ok: false, error: 'Client not found' }

  const { data: existing } = await admin.from('brand_kits').select('version').eq('client_id', clientId).maybeSingle()
  const version = ((existing as { version?: number } | null)?.version ?? 0) + 1

  // Only touch `brief` when the caller passes one (onboarding after extraction). A manual token save
  // omits it, so the upsert leaves the existing brief untouched rather than wiping the image brief.
  const kitRow: Record<string, unknown> = {
    client_id: clientId,
    tokens: parsed.tokens,
    version,
    source_kind: 'manual',
    updated_at: new Date().toISOString(),
  }
  if (brief !== undefined) kitRow.brief = brief

  const { error: kitError } = await admin.from('brand_kits').upsert(kitRow, { onConflict: 'client_id' })
  if (kitError) return { ok: false, error: kitError.message }

  if (feedSystemSlug) {
    const { data: system } = await admin.from('feed_systems').select('id').eq('slug', feedSystemSlug).maybeSingle()
    const feedSystemId = (system as { id?: string } | null)?.id
    if (feedSystemId) {
      await admin.from('client_feed_systems').delete().eq('client_id', clientId)
      const { error: linkError } = await admin
        .from('client_feed_systems')
        .insert({ client_id: clientId, feed_system_id: feedSystemId, is_default: true })
      if (linkError) return { ok: false, error: linkError.message }
    }
  }

  return { ok: true }
}
