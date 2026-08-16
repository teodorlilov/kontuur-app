import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { Json } from '@/types'

/**
 * The client_style_memos.memo storage contract — one learned rule with its
 * provenance weight. Written by the distiller (src/ai/learning), read by the
 * generation-time engine context and the client-settings surface.
 */
export interface StyleMemoBullet {
  rule: string
  evidence_count: number
  last_seen: string
}

interface StyleMemoDisplay {
  bullets: StyleMemoBullet[]
  updatedAt: string
}

/**
 * The memo as the client-settings surface shows it. Admin client because the
 * table is service-role-only (RLS, no policies) — the post_images precedent
 * for user-facing reads of engine-owned tables.
 */
export async function fetchStyleMemoDisplay(clientId: string): Promise<StyleMemoDisplay | null> {
  const { data } = await createAdminSupabaseClient()
    .from('client_style_memos')
    .select('memo, updated_at')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data) return null
  const bullets = parseMemoBullets(data.memo as Json)
  return bullets.length > 0 ? { bullets, updatedAt: data.updated_at as string } : null
}

/** Parse the stored memo column defensively — jsonb from a table the app owns. */
export function parseMemoBullets(memo: Json | null | undefined): StyleMemoBullet[] {
  if (!Array.isArray(memo)) return []
  return memo.filter(
    (b): b is { rule: string; evidence_count: number; last_seen: string } =>
      !!b &&
      typeof b === 'object' &&
      typeof (b as Record<string, unknown>).rule === 'string' &&
      typeof (b as Record<string, unknown>).evidence_count === 'number' &&
      typeof (b as Record<string, unknown>).last_seen === 'string'
  )
}
