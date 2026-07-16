import { randomUUID } from 'node:crypto'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { getStyle } from '@/lib/renderer/styles'
import type { BrandTokens } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import { generateDesign, generateVector } from './fal'
import { buildDesignPrompt, buildVectorPrompt, type PlateRole } from './prompt'
import { uploadPlate } from './storage'
import type { DesignPlate, DesignVector } from '@/types/api'

// How many sample slide designs to generate as the brand's reference set (cover + a couple of interiors).
// Bounded for cost; the same designs seed the reference-image conditioning for every future post.
const SAMPLE_ROLES: PlateRole[] = ['cover', 'interior', 'interior']

/**
 * Generate the onboarding **design system**: a few sample slide designs in the chosen style (brief-driven, no
 * per-slide LLM call). Stored under a temp `onboarding/<nonce>` prefix, keyed by sample index; on save they
 * seed the client's bank as the **reference set** every future post is conditioned on. Compositor-only styles
 * (quiet-grid) yield none. Fail-soft per sample.
 */
export async function generateDesignSystemPlates(params: {
  colors: BrandTokens['color']
  brief: BrandBrief | null
  feedSystemSlug: string | null
  /** Optional art-direction conditioning phrase, when the direction is already known at onboarding. */
  conditioning?: string
  /** The brand's real Instagram grid images (from `fetchInstagramImages`) — conditions the samples on the
   *  look the brand already has, so the generated design system matches their grid. Empty → pure text-to-image. */
  referenceImageUrls?: string[]
}): Promise<Record<string, DesignPlate>> {
  const style = getStyle(params.feedSystemSlug)
  if (!style.generative) return {} // quiet-grid: no imagery — its design system is the colour ground

  const prefix = `onboarding/${randomUUID()}`
  const out: Record<string, DesignPlate> = {}
  await Promise.all(
    SAMPLE_ROLES.map(async (role, index) => {
      const prompt = buildDesignPrompt({
        role,
        scene: null,
        scaffold: style.scaffold,
        colors: params.colors,
        brief: params.brief,
        negativeSpace: style.textZone,
        conditioning: params.conditioning,
      })
      const generated = await generateDesign({ prompt, ratio: DEFAULT_RATIO, referenceImageUrls: params.referenceImageUrls })
      if (!generated) return
      const stored = await uploadPlate(prefix, generated.url)
      if (stored) out[String(index)] = { publicUrl: stored.publicUrl, storagePath: stored.storagePath }
    })
  )
  return out
}

/**
 * Seed the brand's image bank with the onboarding plates (the reference set), keyed `onboarding:<index>` —
 * never matches a post's copy hash. Non-fatal: logs on failure, never blocks client creation.
 */
export async function seedImageBank(clientId: string, plates: Record<string, DesignPlate>): Promise<void> {
  const rows = Object.entries(plates).map(([key, plate]) => ({
    client_id: clientId,
    prompt_hash: `onboarding:${key}`,
    storage_path: plate.storagePath,
    public_url: plate.publicUrl,
  }))
  if (rows.length === 0) return
  const db = createUntypedAdminClient()
  // Replace-in-place: drop prior onboarding rows so re-generating refreshes the bank instead of piling up.
  await db.from('brand_image_bank').delete().eq('client_id', clientId).like('prompt_hash', 'onboarding:%')
  const { error } = await db.from('brand_image_bank').insert(rows)
  if (error) console.error('[images/design-system] seedImageBank failed:', error.message)
}

// A brand's starter vector count — a small, on-brand set from the brief's motifs. Bounded for cost.
const MAX_STARTER_VECTORS = 3

/** Generate the onboarding **starter vector set** — a few on-brand marks from the brief's motifs (or one
 *  abstract fallback), via Recraft. Seeded into `brand_vector_bank` on save; the editor draws from it. Fail-soft
 *  per motif. */
export async function generateDesignSystemVectors(params: {
  colors: BrandTokens['color']
  brief: BrandBrief | null
  feedSystemSlug: string | null
}): Promise<DesignVector[]> {
  const motifs = (params.brief?.motifs ?? []).map((m) => m.trim()).filter(Boolean).slice(0, MAX_STARTER_VECTORS)
  const seeds = motifs.length > 0 ? motifs : ['an abstract geometric brand mark']

  const out: DesignVector[] = []
  await Promise.all(
    seeds.map(async (motif) => {
      const prompt = buildVectorPrompt({ motif, colors: params.colors, feedSystemSlug: params.feedSystemSlug })
      const vector = await generateVector(prompt)
      if (vector) out.push({ svg: vector.svg, label: motif })
    })
  )
  return out
}

/** Seed the brand's vector bank with the onboarding starter marks (`onboarding:<n>`). Non-fatal; mirrors
 *  `seedImageBank`. */
export async function seedVectorBank(clientId: string, vectors: DesignVector[]): Promise<void> {
  const rows = vectors.map((v, i) => ({
    client_id: clientId,
    label: v.label,
    prompt_hash: `onboarding:${i}`,
    svg: v.svg,
  }))
  if (rows.length === 0) return
  const db = createUntypedAdminClient()
  // Replace-in-place, mirroring seedImageBank — a re-generated starter set refreshes rather than piles up.
  await db.from('brand_vector_bank').delete().eq('client_id', clientId).like('prompt_hash', 'onboarding:%')
  const { error } = await db.from('brand_vector_bank').insert(rows)
  if (error) console.error('[images/design-system] seedVectorBank failed:', error.message)
}
