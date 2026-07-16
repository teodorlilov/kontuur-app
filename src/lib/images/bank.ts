import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { BrandTokens } from '@/lib/scene-graph'
import { generatePlate, generateVector, removeBackground } from './fal'
import { promptHash } from './hash'
import { buildImagePrompt, buildVectorPrompt, formatForModel, paletteWords, type PlateRole } from './prompt'
import { composeScene } from './scene'
import { uploadPlate } from './storage'

/**
 * The per-brand plate bank: a durable image URL for a slide, cached by a *deterministic* key (slide copy
 * + brand art-direction) so a regenerate or a second post with the same copy reuses the image instead of
 * paying for the LLM scene + fal call again. On a miss it composes the scene, builds the prompt,
 * generates, and stores the result in the `plates` bucket. Fail-soft throughout: null → caller keeps the
 * token gradient (no key, generation failure, or storage failure all degrade to no image, never a crash).
 *
 * App-level access (no RLS on `brand_image_bank`), same as the other composition-engine tables.
 */

export type ResolvePlateParams = {
  clientId: string
  role: PlateRole
  slide: { headline: string; body: string }
  brief: BrandBrief | null
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  ratio: AspectRatio
  seed?: number
  /** When true, generate an isolated subject and background-remove it into a transparent cutout PNG. */
  cutout?: boolean
  /** fal model id override (from the style's `imageModel.photo`); undefined → the provider default. */
  model?: string
}

export async function resolvePlate(params: ResolvePlateParams): Promise<string | null> {
  const db = createUntypedAdminClient()
  const hash = promptHash({
    headline: params.slide.headline,
    body: params.slide.body,
    subjects: params.brief?.photographicSubjects ?? [],
    mood: params.brief?.mood ?? '',
    palette: paletteWords(params.colors),
    feedSystemSlug: params.feedSystemSlug ?? 'editorial',
    ratio: params.ratio,
    role: params.role,
    cutout: params.cutout ?? false,
  })

  // Cache hit — reuse an image already generated for this brand + prompt.
  const { data: existing } = await db
    .from('brand_image_bank')
    .select('public_url')
    .eq('client_id', params.clientId)
    .eq('prompt_hash', hash)
    .maybeSingle()
  const cached = (existing as { public_url?: string } | null)?.public_url
  if (cached) return cached

  // Miss — build the prompt and generate. A cutout wants an isolated subject (the brief subject, framed
  // for clean removal), so it skips the environmental scene call; a full-bleed plate composes a per-slide
  // scene (fail-soft to a brief subject).
  const scene = params.cutout
    ? null
    : await composeScene({ headline: params.slide.headline, body: params.slide.body, brief: params.brief })
  const structured = buildImagePrompt({
    role: params.role,
    brief: params.brief,
    colors: params.colors,
    feedSystemSlug: params.feedSystemSlug,
    ratio: params.ratio,
    scene,
    cutout: params.cutout,
  })
  const { prompt } = formatForModel(structured, 'flux')

  const generated = await generatePlate({ prompt, ratio: params.ratio, seed: params.seed, model: params.model })
  if (!generated) return null

  // A cutout is background-removed into a transparent PNG before storage; failure keeps the colour block
  // alone (return null → no src).
  const source = params.cutout ? await removeBackground(generated.url) : generated
  if (!source) return null

  const stored = await uploadPlate(params.clientId, source.url)
  if (!stored) {
    console.error('[images/bank] resolvePlate: fal generated the image but the copy to the "plates" bucket failed (bucket missing / storage perms). Keeping the gradient.')
    return null // don't persist an ephemeral fal URL into post_visuals — keep the gradient
  }

  // Index it for reuse. A concurrent generate of the same hash can lose the unique-index race; that's
  // fine — we still return the image we uploaded rather than discard a paid generation.
  const { error } = await db.from('brand_image_bank').insert({
    client_id: params.clientId,
    role: params.role,
    prompt_hash: hash,
    storage_path: stored.storagePath,
    public_url: stored.publicUrl,
  })
  if (error) console.warn('[images/bank] bank insert skipped:', error.message)
  return stored.publicUrl
}

export type ResolveVectorParams = {
  clientId: string
  /** The motif to illustrate (a brief motif, or an abstract fallback). */
  motif: string
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  /** fal model id override (from the style's `imageModel.vector`); undefined → the Recraft default. */
  model?: string
  /** The art director's ornament directive — folds the brand's ornament character into the mark. */
  ornament?: string
}

/**
 * The per-brand **vector bank**: a durable SVG for a brand mark, cached by a deterministic key (motif +
 * palette + style) so a vector archetype reuses the brand's marks across posts instead of paying Recraft
 * each time — the vector analogue of `resolvePlate`. On a miss it builds the Recraft prompt, generates,
 * and stores the SVG. Fail-soft: null → the caller leaves the mark empty (the colour ground stands alone).
 * Depends on `brand_vector_bank` (migration `20260718`); until applied the select/insert error → still
 * fail-soft (a failed select just misses; a failed insert still returns the generated svg).
 */
export async function resolveVector(params: ResolveVectorParams): Promise<string | null> {
  const db = createUntypedAdminClient()
  const hash = promptHash({
    motif: params.motif,
    palette: paletteWords(params.colors),
    feedSystemSlug: params.feedSystemSlug ?? 'editorial',
    ornament: params.ornament ?? '',
    kind: 'vector',
  })

  const { data: existing } = await db
    .from('brand_vector_bank')
    .select('svg')
    .eq('client_id', params.clientId)
    .eq('prompt_hash', hash)
    .maybeSingle()
  const cached = (existing as { svg?: string } | null)?.svg
  if (cached) return cached

  const prompt = buildVectorPrompt({ motif: params.motif, colors: params.colors, feedSystemSlug: params.feedSystemSlug, ornament: params.ornament })
  const generated = await generateVector(prompt, params.model)
  if (!generated) return null

  const { error } = await db.from('brand_vector_bank').insert({
    client_id: params.clientId,
    label: params.motif,
    prompt_hash: hash,
    svg: generated.svg,
  })
  if (error) console.warn('[images/bank] vector bank insert skipped:', error.message)
  return generated.svg
}
