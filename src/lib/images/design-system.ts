import { randomUUID } from 'node:crypto'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { feedSystemPack } from '@/lib/renderer/feed-system-compositions'
import type { ReferenceRole } from '@/lib/renderer/reference-compositions'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import type { BrandTokens, Composition } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import { generatePlate } from './fal'
import { buildImagePrompt, formatForModel, type PlateRole } from './prompt'
import { uploadPlate } from './storage'

/** One generated design-system plate: what to render (public_url) + where it lives (storage_path). This
 *  module stays free of the LLM/provider chain, so the `saveBrandKit` server action can seed the bank
 *  without dragging the AI client. */
export type SeedPlate = { publicUrl: string; storagePath: string }

const hasPlate = (c: Composition): boolean => c.layers.some((l) => l.type === 'plate')

/**
 * Generate the onboarding **design system**: one background plate per plate-bearing role of the chosen
 * feed system, from the brand brief. There are no posts yet, so `buildImagePrompt` uses its brief-driven
 * fallback scene (no per-slide LLM call — cheaper). Plates are stored under a temp `onboarding/<nonce>`
 * prefix and returned by role; the review previews them under the live token layer, and on "save" they
 * seed the new client's bank (`seedImageBank`). Fail-soft per role — a failure just omits that role.
 */
export async function generateDesignSystemPlates(params: {
  colors: BrandTokens['color']
  brief: BrandBrief | null
  feedSystemSlug: string | null
}): Promise<Record<string, SeedPlate>> {
  const prefix = `onboarding/${randomUUID()}`
  const pack = feedSystemPack(params.feedSystemSlug)
  const roles = (Object.keys(pack) as ReferenceRole[]).filter((r) => hasPlate(pack[r]))

  const out: Record<string, SeedPlate> = {}
  await Promise.all(
    roles.map(async (role) => {
      const plateRole: PlateRole = role === 'cover' ? 'cover' : 'interior'
      const structured = buildImagePrompt({
        role: plateRole,
        brief: params.brief,
        colors: params.colors,
        feedSystemSlug: params.feedSystemSlug,
        ratio: DEFAULT_RATIO,
        scene: null,
      })
      const { prompt } = formatForModel(structured, 'flux')
      const generated = await generatePlate({ prompt, ratio: DEFAULT_RATIO })
      if (!generated) return
      const stored = await uploadPlate(prefix, generated.url)
      if (stored) out[role] = { publicUrl: stored.publicUrl, storagePath: stored.storagePath }
    })
  )
  return out
}

/**
 * Seed the brand's image bank with the design-system plates generated at onboarding — the brand's
 * reference set, keyed by a brand-level `onboarding:<role>` marker (never matches a post's copy hash, so
 * posts still generate their own slide-relevant images). Non-fatal: logs and returns on failure so it
 * never blocks client creation.
 */
export async function seedImageBank(clientId: string, plates: Record<string, SeedPlate>): Promise<void> {
  const rows = Object.entries(plates).map(([role, plate]) => ({
    client_id: clientId,
    role,
    prompt_hash: `onboarding:${role}`,
    storage_path: plate.storagePath,
    public_url: plate.publicUrl,
  }))
  if (rows.length === 0) return
  const db = createUntypedAdminClient()
  const { error } = await db.from('brand_image_bank').insert(rows)
  if (error) console.error('[images/design-system] seedImageBank failed:', error.message)
}
