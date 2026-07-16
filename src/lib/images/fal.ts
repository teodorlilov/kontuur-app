import { fal } from '@fal-ai/client'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import { isSvg, sanitizeSvg } from './svg'

/**
 * The fal.ai provider seam (key `FAL_API_KEY`, never `NEXT_PUBLIC_`). Every call is deliberately fail-soft:
 * no key or any error returns null, and the caller falls back to the composition's token gradient — a slide
 * never hard-fails on an imagery problem. `generateDesign`/`editDesign` render + edit the rich, text-free
 * slide visual (we composite the brand text on top); `removeBackground` cuts a subject out; `generateVector`
 * makes an on-brand vector mark. Model ids are env-overridable for easy A/B without a code change.
 */

// BiRefNet — state-of-the-art subject/background segmentation, returns a transparent PNG. Swap via env.
const DEFAULT_BG_REMOVAL_MODEL = 'fal-ai/birefnet'

// Recraft text-to-vector — returns true SVG (scalable, recolourable). Swap/pin via env. NOTE: verify the
// exact model id against the fal dashboard on first live run (mirrors the BiRefNet flag).
const DEFAULT_VECTOR_MODEL = 'fal-ai/recraft/v4.1/text-to-vector'

// The capable *design* model that renders the whole rich, text-free slide visual (we composite the brand
// text on top). Nano Banana (Gemini 2.5 Flash Image) — fast, cheap, and strongest at reference conditioning
// (our brand-consistency backbone). The base endpoint is text-to-image; the `/edit` endpoint takes
// `image_urls` (brand references / the image being edited). Env-overridable; verify the ids on the first run.
const DEFAULT_DESIGN_MODEL = 'fal-ai/nano-banana'
const DEFAULT_DESIGN_EDIT_MODEL = 'fal-ai/nano-banana/edit'

// Nano Banana sizes the output via an `aspect_ratio` enum (no custom width/height). We render at the exact
// brand ratio; the plate is cover-fit into the 1080-wide canvas at render, so any minor rounding is cropped.
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
  /** The full positive prompt — the design brief. "No text/letters" is folded in by `buildDesignPrompt`,
   *  because we composite the brand typography ourselves (and Cyrillic would misspell). */
  prompt: string
  ratio: AspectRatio
  /** Brand reference image(s) the model conditions on — the strongest brand-consistency lever. When present
   *  we route through the `/edit` endpoint (which takes `image_urls`), so the brand's real look guides the
   *  from-scratch design. */
  referenceImageUrls?: string[]
}

/**
 * Generate one full **design** slide via Nano Banana — a rich, text-free composition with reserved negative
 * space for the brand text we composite on top. Fail-soft: no key or any error → null → the caller keeps the
 * token gradient. With brand references it routes through the `/edit` endpoint (that's where `image_urls` —
 * the reference conditioning — lives), so the brand's real look guides the design.
 */
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
  /** The image being edited (the slide's current design plate). */
  imageUrl: string
  /** The edit instruction — what to change ("swap the background to a calm studio", "add a small arrow"). */
  prompt: string
  /** Extra brand reference(s) passed alongside the edited image to keep the result on-brand. */
  referenceImageUrls?: string[]
  ratio: AspectRatio
}

/**
 * Edit an existing design via Nano Banana edit — the editor's instruction-based edit / reference seam. The
 * edited image (plus any brand references) is passed as `image_urls`, and the whole image is re-rendered from
 * the instruction (Nano Banana edits regions from natural language; it has no mask parameter). Fail-soft →
 * null keeps the plate.
 */
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
 * Generate one on-brand vector graphic, returning sanitised SVG source (Recraft hosts the .svg; we fetch
 * + sanitise the text so it can be stored and rasterised). Fail-soft: no key, a failed call, a non-SVG
 * body, or a fetch error all return null. Model overridable via `FAL_VECTOR_MODEL`.
 */
export async function generateVector(prompt: string): Promise<{ svg: string } | null> {
  if (!ensureConfigured()) return null
  const model = process.env.FAL_VECTOR_MODEL ?? DEFAULT_VECTOR_MODEL
  try {
    const result = await fal.subscribe(model, { input: { prompt } })
    const data = result?.data as { images?: Array<{ url?: string }>; image?: { url?: string } } | undefined
    const url = data?.images?.[0]?.url ?? data?.image?.url
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
