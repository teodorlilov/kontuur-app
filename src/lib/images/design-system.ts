import { randomUUID } from 'node:crypto'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import { getStyle } from '@/lib/renderer/styles'
import type { BrandTokens } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import { generateDesign, generateVector } from './fal'
import { buildDesignPrompt, buildVectorPrompt, type PlateRole } from './prompt'
import { uploadPlate } from './storage'

/** One generated design-system plate: what to render (public_url) + where it lives (storage_path). This
 *  module stays free of the LLM/provider chain, so the `saveBrandKit` server action can seed the bank
 *  without dragging the AI client. */
export type SeedPlate = { publicUrl: string; storagePath: string }

// How many sample slide designs to generate as the brand's reference set (cover + a couple of interiors).
// Bounded for cost; the same designs seed the reference-image conditioning for every future post.
const SAMPLE_ROLES: PlateRole[] = ['cover', 'interior', 'interior']

/**
 * Generate the onboarding **design system**: a few sample slide designs in the chosen style, rendered by the
 * capable design model from the brand brief. There are no posts yet, so `buildDesignPrompt` uses its
 * brief-driven fallback scene (no per-slide LLM call — cheaper). Designs are stored under a temp
 * `onboarding/<nonce>` prefix and returned **keyed by sample index** (the preview injects each into the
 * matching sample cell); on "save" they seed the new client's bank as the **reference set** every future
 * post is conditioned on. A compositor-only style (`quiet-grid`) yields none — its design system is the clean
 * colour ground + type. Fail-soft per sample — a failure just omits it.
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
}): Promise<Record<string, SeedPlate>> {
  const style = getStyle(params.feedSystemSlug)
  if (!style.generative) return {} // quiet-grid: no imagery — its design system is the colour ground

  const prefix = `onboarding/${randomUUID()}`
  const out: Record<string, SeedPlate> = {}
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
  // Replace-in-place: drop any prior design-system rows for this client so re-generating from the settings
  // Visual system tab refreshes the bank instead of accumulating duplicate `onboarding:<role>` rows.
  await db.from('brand_image_bank').delete().eq('client_id', clientId).like('prompt_hash', 'onboarding:%')
  const { error } = await db.from('brand_image_bank').insert(rows)
  if (error) console.error('[images/design-system] seedImageBank failed:', error.message)
}

/** One generated brand vector: the SVG source + the motif it came from (operator-facing label). */
export type SeedVector = { svg: string; label: string }

// A brand's starter vector count — a small, on-brand set from the brief's motifs. Bounded for cost.
const MAX_STARTER_VECTORS = 3

/**
 * Generate the onboarding **starter vector set**: a few on-brand marks from the brief's motifs (or one
 * abstract fallback when the brief has none), via Recraft text-to-vector. Returns them for the review to
 * display; on "save" they seed the new client's `brand_vector_bank` (`seedVectorBank`) as a reusable asset
 * set the editor draws from later. Fail-soft per motif — a failure just omits that mark.
 */
export async function generateDesignSystemVectors(params: {
  colors: BrandTokens['color']
  brief: BrandBrief | null
  feedSystemSlug: string | null
}): Promise<SeedVector[]> {
  const motifs = (params.brief?.motifs ?? []).map((m) => m.trim()).filter(Boolean).slice(0, MAX_STARTER_VECTORS)
  const seeds = motifs.length > 0 ? motifs : ['an abstract geometric brand mark']

  const out: SeedVector[] = []
  await Promise.all(
    seeds.map(async (motif) => {
      const prompt = buildVectorPrompt({ motif, colors: params.colors, feedSystemSlug: params.feedSystemSlug })
      const vector = await generateVector(prompt)
      if (vector) out.push({ svg: vector.svg, label: motif })
    })
  )
  return out
}

/**
 * Seed the brand's vector bank with the onboarding starter marks — keyed by a brand-level `onboarding:<n>`
 * marker (never collides with a later copy/motif hash). Non-fatal: logs and returns on failure so it never
 * blocks client creation. Mirrors `seedImageBank`.
 */
export async function seedVectorBank(clientId: string, vectors: SeedVector[]): Promise<void> {
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
