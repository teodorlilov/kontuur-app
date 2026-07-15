import { fal } from '@fal-ai/client'
import { RATIO_SIZES, type AspectRatio } from '@/lib/renderer/layout/anchor'
import { isSvg, sanitizeSvg } from './svg'

/**
 * The fal.ai provider seam. `generatePlate` produces one background image via a Flux model server-side
 * (key `FAL_API_KEY`, never `NEXT_PUBLIC_`). It is deliberately fail-soft: no key or any error returns
 * null, and the caller falls back to the composition's token gradient — a slide never hard-fails on an
 * imagery problem. Model is overridable via `FAL_IMAGE_MODEL` for easy A/B without a code change.
 */

// FLUX.1 [schnell] — fast + cheap (~1-4 steps), good for backgrounds. The default; swap via env.
const DEFAULT_MODEL = 'fal-ai/flux/schnell'

// BiRefNet — state-of-the-art subject/background segmentation, returns a transparent PNG. Swap via env.
const DEFAULT_BG_REMOVAL_MODEL = 'fal-ai/birefnet'

// Recraft text-to-vector — returns true SVG (scalable, recolourable). Swap/pin via env. NOTE: verify the
// exact model id against the fal dashboard on first live run (mirrors the BiRefNet flag).
const DEFAULT_VECTOR_MODEL = 'fal-ai/recraft/v4.1/text-to-vector'

// Reference-conditioned (image-to-image) + region inpaint. Env-overridable; verify ids on first live run.
const DEFAULT_IMG2IMG_MODEL = 'fal-ai/flux/dev/image-to-image'
const DEFAULT_INPAINT_MODEL = 'fal-ai/flux/dev/inpainting'

const firstImageUrl = (data: unknown): string | undefined =>
  (data as { images?: Array<{ url?: string }>; image?: { url?: string } } | undefined)?.images?.[0]?.url ??
  (data as { image?: { url?: string } } | undefined)?.image?.url

let configured = false
function ensureConfigured(): boolean {
  const key = process.env.FAL_API_KEY
  if (!key) return false
  if (!configured) {
    fal.config({ credentials: key })
    configured = true
  }
  return true
}

export type GeneratePlateInput = {
  /** The full positive prompt. We fold the "no text" instruction into it (Flux has no negative-prompt
   *  param), because we composite our own typography. */
  prompt: string
  ratio: AspectRatio
  seed?: number
  model?: string
}

/** Generate one plate. Returns the hosted image URL, or null when imagery is unavailable/failed. */
export async function generatePlate(input: GeneratePlateInput): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const size = RATIO_SIZES[input.ratio]
  const model = input.model ?? process.env.FAL_IMAGE_MODEL ?? DEFAULT_MODEL
  try {
    const result = await fal.subscribe(model, {
      input: {
        prompt: input.prompt,
        image_size: { width: size.w, height: size.h },
        num_images: 1,
        enable_safety_checker: true,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      },
    })
    const url = (result?.data as { images?: Array<{ url?: string }> } | undefined)?.images?.[0]?.url
    return url ? { url } : null
  } catch (err) {
    console.error('[images/fal] generatePlate failed:', err)
    return null
  }
}

/**
 * Remove the background from a generated image, returning a hosted transparent PNG (the subject cutout)
 * — the collage look's core seam. Fail-soft: no key or any error returns null, and the caller keeps the
 * colour block alone. Model overridable via `FAL_BG_REMOVAL_MODEL`.
 */
export async function removeBackground(imageUrl: string): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const model = process.env.FAL_BG_REMOVAL_MODEL ?? DEFAULT_BG_REMOVAL_MODEL
  try {
    const result = await fal.subscribe(model, { input: { image_url: imageUrl } })
    // BiRefNet returns `image`; some segmentation models return `images[0]` — accept either.
    const data = result?.data as { image?: { url?: string }; images?: Array<{ url?: string }> } | undefined
    const url = data?.image?.url ?? data?.images?.[0]?.url
    return url ? { url } : null
  } catch (err) {
    console.error('[images/fal] removeBackground failed:', err)
    return null
  }
}

/**
 * Reference-conditioned generation (Phase 6): produce a new image guided by a reference (img2img), so an
 * operator can seed a plate from an image they like. `strength` (0..1) is how far to move from the
 * reference. Fail-soft. Model overridable via `FAL_IMG2IMG_MODEL`.
 */
export async function imageToImage(input: {
  imageUrl: string
  prompt: string
  ratio: AspectRatio
  strength?: number
  seed?: number
}): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const size = RATIO_SIZES[input.ratio]
  const model = process.env.FAL_IMG2IMG_MODEL ?? DEFAULT_IMG2IMG_MODEL
  try {
    const result = await fal.subscribe(model, {
      input: {
        prompt: input.prompt,
        image_url: input.imageUrl,
        strength: input.strength ?? 0.8,
        image_size: { width: size.w, height: size.h },
        num_images: 1,
        enable_safety_checker: true,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      },
    })
    const url = firstImageUrl(result?.data)
    return url ? { url } : null
  } catch (err) {
    console.error('[images/fal] imageToImage failed:', err)
    return null
  }
}

/**
 * Region inpaint (Phase 6): repaint the masked area of an image from a prompt (white mask = repaint).
 * Fail-soft. Model overridable via `FAL_INPAINT_MODEL`.
 */
export async function inpaintImage(input: {
  imageUrl: string
  maskUrl: string
  prompt: string
  seed?: number
}): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const model = process.env.FAL_INPAINT_MODEL ?? DEFAULT_INPAINT_MODEL
  try {
    const result = await fal.subscribe(model, {
      input: {
        prompt: input.prompt,
        image_url: input.imageUrl,
        mask_url: input.maskUrl,
        num_images: 1,
        enable_safety_checker: true,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      },
    })
    const url = firstImageUrl(result?.data)
    return url ? { url } : null
  } catch (err) {
    console.error('[images/fal] inpaintImage failed:', err)
    return null
  }
}

/**
 * Generate one on-brand vector graphic, returning sanitised SVG source (Recraft hosts the .svg; we fetch
 * + sanitise the text so it can be stored and rasterised). Fail-soft: no key, a failed call, a non-SVG
 * body, or a fetch error all return null. Model overridable via `FAL_VECTOR_MODEL`.
 */
export async function generateVector(prompt: string, modelId?: string): Promise<{ svg: string } | null> {
  if (!ensureConfigured()) return null
  const model = modelId ?? process.env.FAL_VECTOR_MODEL ?? DEFAULT_VECTOR_MODEL
  try {
    const result = await fal.subscribe(model, { input: { prompt } })
    const data = result?.data as { images?: Array<{ url?: string }>; image?: { url?: string } } | undefined
    const url = data?.images?.[0]?.url ?? data?.image?.url
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const svg = sanitizeSvg(await res.text())
    return isSvg(svg) ? { svg } : null
  } catch (err) {
    console.error('[images/fal] generateVector failed:', err)
    return null
  }
}
