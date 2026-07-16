import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { BrandTokens } from '@/lib/scene-graph'
import { generateDesign, generateVector } from './fal'
import { promptHash } from './hash'
import { buildDesignPrompt, buildVectorPrompt, paletteWords, type NegativeSpace, type PlateRole } from './prompt'
import { composeScene } from './scene'
import { uploadPlate } from './storage'

/**
 * Per-brand **design bank**: a durable image URL for a slide's design, cached by a deterministic key (slide
 * copy + brand direction) so a regenerate or a repeat reuses it instead of paying for the LLM scene +
 * design-model call again. Fail-soft throughout — any failure → null → the caller keeps the token gradient.
 * App-level access (no RLS), like the other composition-engine tables.
 */

/** The brand's design-system reference images (seeded at onboarding, keyed `onboarding:*`) — the strongest
 *  consistency lever, threaded into every `resolveDesign` call. Empty on a miss (fail-soft). */
export async function getBrandReferenceImages(clientId: string): Promise<string[]> {
  try {
    const db = createUntypedAdminClient()
    const { data } = await db
      .from('brand_image_bank')
      .select('public_url')
      .eq('client_id', clientId)
      .like('prompt_hash', 'onboarding:%')
    return ((data as Array<{ public_url?: string }> | null) ?? []).map((r) => r.public_url).filter((u): u is string => Boolean(u))
  } catch (err) {
    console.error('[images/bank] getBrandReferenceImages failed:', err)
    return [] // fail-soft: generation falls back to text-to-image (no reference conditioning)
  }
}

export type ResolveDesignParams = {
  clientId: string
  role: PlateRole
  slide: { headline: string; body: string }
  brief: BrandBrief | null
  colors: BrandTokens['color']
  feedSystemSlug: string | null
  ratio: AspectRatio
  /** The style's prompt scaffold (aesthetic directives) — passed in so the bank stays decoupled from styles. */
  scaffold: string
  /** Where the style reserves negative space for the composited text. */
  negativeSpace: NegativeSpace
  /** The art-direction conditioning phrase (formality / density / palette discipline / personality). */
  conditioning?: string
  /** Pre-composed carousel-aware scene for this slide; null → `resolveDesign` composes a per-slide scene. */
  scene?: string | null
  /** Brand reference images the design model conditions on (from `getBrandReferenceImages`). */
  referenceImageUrls?: string[]
}

export async function resolveDesign(params: ResolveDesignParams): Promise<string | null> {
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
    conditioning: params.conditioning ?? '',
  })

  // Cache hit — reuse a design already generated for this brand + prompt.
  const { data: existing } = await db
    .from('brand_image_bank')
    .select('public_url')
    .eq('client_id', params.clientId)
    .eq('prompt_hash', hash)
    .maybeSingle()
  const cached = (existing as { public_url?: string } | null)?.public_url
  if (cached) return cached

  // Miss — compose the per-slide scene (unless one was planned carousel-aware), build the design prompt, and
  // generate. Fail-soft to a brief subject when the scene call returns nothing.
  const scene =
    params.scene ?? (await composeScene({ headline: params.slide.headline, body: params.slide.body, brief: params.brief }))
  const prompt = buildDesignPrompt({
    role: params.role,
    scene,
    scaffold: params.scaffold,
    colors: params.colors,
    brief: params.brief,
    negativeSpace: params.negativeSpace,
    conditioning: params.conditioning,
  })

  const generated = await generateDesign({
    prompt,
    ratio: params.ratio,
    referenceImageUrls: params.referenceImageUrls,
  })
  if (!generated) return null

  const stored = await uploadPlate(params.clientId, generated.url)
  if (!stored) {
    console.error('[images/bank] resolveDesign: the design model generated the image but the copy to the "plates" bucket failed (bucket missing / storage perms). Keeping the gradient.')
    return null // don't persist an ephemeral fal URL into post_visuals — keep the gradient
  }

  // Index it for reuse. A concurrent generate of the same hash can lose the unique-index race; that's fine —
  // we still return the image we uploaded rather than discard a paid generation.
  const { error } = await db.from('brand_image_bank').insert({
    client_id: params.clientId,
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
  /** The art director's ornament directive — folds the brand's ornament character into the mark. */
  ornament?: string
}

/** Per-brand **vector bank** — the vector analogue of `resolveDesign`: a durable SVG cached by (motif +
 *  palette + style) so the editor's marks + the onboarding starter set reuse a brand's vectors. Fail-soft:
 *  null → the caller leaves the mark empty. */
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
  const generated = await generateVector(prompt)
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
