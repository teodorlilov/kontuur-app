import { fal } from '@fal-ai/client'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import { isSvg, sanitizeSvg } from './svg'

/**
 * fal.ai provider seam (`FAL_API_KEY`, server-only). Every call is fail-soft — no key or any error → null,
 * so a slide degrades to its token gradient rather than hard-failing. Model ids are env-overridable.
 */

// BiRefNet — subject/background segmentation → transparent PNG.
const DEFAULT_BG_REMOVAL_MODEL = 'fal-ai/birefnet'

// Recraft text-to-vector → real SVG. Verify the id on first live run.
const DEFAULT_VECTOR_MODEL = 'fal-ai/recraft/v4.1/text-to-vector'

// Nano Banana (Gemini 2.5 Flash Image) — the design model. Base = text-to-image; `/edit` takes `image_urls`.
const DEFAULT_DESIGN_MODEL = 'fal-ai/nano-banana'
const DEFAULT_DESIGN_EDIT_MODEL = 'fal-ai/nano-banana/edit'

// Nano Banana sizes via an aspect_ratio enum (no custom w/h); the plate is cover-fit at render.
const DESIGN_ASPECT: Record<AspectRatio, string> = { '4:5': '4:5', '1:1': '1:1' }

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

type GenerateDesignInput = {
  /** The positive prompt; the no-text rule is folded in by `buildDesignPrompt` (we composite type). */
  prompt: string
  ratio: AspectRatio
  /** Brand reference image(s) → routes through `/edit` (the only endpoint that takes `image_urls`). */
  referenceImageUrls?: string[]
}

/** Generate one text-free design slide via Nano Banana. With brand references it routes through `/edit`.
 *  Fail-soft → null keeps the token gradient. */
export async function generateDesign(input: GenerateDesignInput): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const aspect_ratio = DESIGN_ASPECT[input.ratio]
  const refs = (input.referenceImageUrls ?? []).filter(Boolean)
  try {
    const result =
      refs.length > 0
        ? await fal.subscribe(process.env.FAL_DESIGN_EDIT_MODEL ?? DEFAULT_DESIGN_EDIT_MODEL, {
            input: { prompt: input.prompt, image_urls: refs, aspect_ratio, num_images: 1 },
          })
        : await fal.subscribe(process.env.FAL_DESIGN_MODEL ?? DEFAULT_DESIGN_MODEL, {
            input: { prompt: input.prompt, aspect_ratio, num_images: 1 },
          })
    const url = firstImageUrl(result?.data)
    if (!url) console.error('[images/fal] generateDesign: no image url in response:', JSON.stringify(result?.data)?.slice(0, 400))
    return url ? { url } : null
  } catch (err) {
    console.error('[images/fal] generateDesign failed:', err)
    return null
  }
}

type EditDesignInput = {
  /** The image being edited (the slide's current plate). */
  imageUrl: string
  /** The edit instruction ("swap the background to a calm studio"). */
  prompt: string
  /** Extra brand reference(s) to keep the edit on-brand. */
  referenceImageUrls?: string[]
  ratio: AspectRatio
}

/** Edit a design via Nano Banana edit — the image (+ references) as `image_urls`, re-rendered from the
 *  instruction. No mask parameter, so edits are whole-image + language-directed. Fail-soft → null. */
export async function editDesign(input: EditDesignInput): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const aspect_ratio = DESIGN_ASPECT[input.ratio]
  const refs = (input.referenceImageUrls ?? []).filter(Boolean)
  const model = process.env.FAL_DESIGN_EDIT_MODEL ?? DEFAULT_DESIGN_EDIT_MODEL
  try {
    const result = await fal.subscribe(model, {
      input: { prompt: input.prompt, image_urls: [input.imageUrl, ...refs], aspect_ratio, num_images: 1 },
    })
    const url = firstImageUrl(result?.data)
    if (!url) console.error('[images/fal] editDesign: no image url in response:', JSON.stringify(result?.data)?.slice(0, 400))
    return url ? { url } : null
  } catch (err) {
    console.error('[images/fal] editDesign failed:', err)
    return null
  }
}

/** Background-remove an image → hosted transparent PNG (the subject cutout). Fail-soft → null. */
export async function removeBackground(imageUrl: string): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const model = process.env.FAL_BG_REMOVAL_MODEL ?? DEFAULT_BG_REMOVAL_MODEL
  try {
    const result = await fal.subscribe(model, { input: { image_url: imageUrl } })
    // BiRefNet returns `image`; some segmentation models return `images[0]` — `firstImageUrl` accepts either.
    const url = firstImageUrl(result?.data)
    return url ? { url } : null
  } catch (err) {
    console.error('[images/fal] removeBackground failed:', err)
    return null
  }
}

/** Generate one on-brand vector → sanitised SVG source (we fetch + sanitise Recraft's hosted .svg).
 *  Fail-soft: no key, a failed call, a non-SVG body, or a fetch error → null. */
export async function generateVector(prompt: string): Promise<{ svg: string } | null> {
  if (!ensureConfigured()) return null
  const model = process.env.FAL_VECTOR_MODEL ?? DEFAULT_VECTOR_MODEL
  try {
    const result = await fal.subscribe(model, { input: { prompt } })
    const url = firstImageUrl(result?.data)
    if (!url) {
      console.error(`[images/fal] generateVector: no asset url in "${model}" response:`, JSON.stringify(result?.data)?.slice(0, 400))
      return null
    }
    const res = await fetch(url)
    if (!res.ok) {
      console.error('[images/fal] generateVector: asset fetch failed', res.status, url)
      return null
    }
    const body = await res.text()
    const svg = sanitizeSvg(body)
    if (!isSvg(svg)) {
      console.error(
        `[images/fal] generateVector: "${model}" returned a non-SVG asset (content-type ${res.headers.get('content-type')}) — this model likely produces raster, not vector. Point FAL_VECTOR_MODEL at a real text-to-vector endpoint.`,
        body.slice(0, 120)
      )
      return null
    }
    return { svg }
  } catch (err) {
    console.error('[images/fal] generateVector failed:', err)
    return null
  }
}
