import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import type { BrandTokens } from '@/lib/scene-graph'
import { generatePlate } from './fal'
import { promptHash } from './hash'
import { buildImagePrompt, formatForModel, paletteWords, type PlateRole } from './prompt'
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

  // Miss — compose a per-slide scene (fail-soft to a brief subject), build + format the prompt, generate.
  const scene = await composeScene({ headline: params.slide.headline, body: params.slide.body, brief: params.brief })
  const structured = buildImagePrompt({
    role: params.role,
    brief: params.brief,
    colors: params.colors,
    feedSystemSlug: params.feedSystemSlug,
    ratio: params.ratio,
    scene,
  })
  const { prompt } = formatForModel(structured, 'flux')

  const generated = await generatePlate({ prompt, ratio: params.ratio, seed: params.seed })
  if (!generated) return null

  const stored = await uploadPlate(params.clientId, generated.url)
  if (!stored) return null // don't persist an ephemeral fal URL into post_visuals — keep the gradient

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
