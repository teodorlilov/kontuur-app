import 'server-only'

import { fal, ApiError } from '@fal-ai/client'
import type { Rgb } from './extract/color'

const FAL_MODEL = 'fal-ai/gpt-image-2'
const DIS_MODEL = 'fal-ai/birefnet/v2'
const EDIT_MODEL = 'openai/gpt-image-2/edit'
const VECTOR_MODEL = 'fal-ai/recraft/v4/text-to-vector'
/** 4:5 portrait — IG's tallest publishable feed ratio (the Graph API rejects anything below 4:5).
 *  gpt-image-2 requires dimensions in multiples of 16; 1088×1360 is the exact-4:5 size nearest the
 *  1080×1350 canvas the editor authors at. */
export const FAL_IMAGE_SIZE = { width: 1088, height: 1360 }

let configured = false

function ensureConfigured(): void {
  if (configured) return
  const credentials = process.env.FAL_API_KEY
  if (!credentials) throw new Error('FAL_API_KEY is not set')
  // The client's default env var is FAL_KEY; ours is FAL_API_KEY, so credentials are passed explicitly.
  fal.config({ credentials })
  configured = true
}

/**
 * All model invocations go through here: fal's ApiError message is only the HTTP status text
 * ("Forbidden"), while the actual reason — exhausted balance, a locked key, a flagged prompt —
 * rides in the response body's `detail` and would otherwise be dropped.
 */
async function subscribeFal(model: string, input: Record<string, unknown>) {
  ensureConfigured()
  try {
    return await fal.subscribe(model, { input })
  } catch (err) {
    if (err instanceof ApiError && err.body) {
      const detail = (err.body as { detail?: unknown }).detail
      if (detail) {
        const reason = typeof detail === 'string' ? detail : JSON.stringify(detail)
        throw new Error(`${model}: ${err.message} — ${reason}`, { cause: err })
      }
    }
    throw err
  }
}

function firstImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  // fal's subscribe() result is typed per-endpoint; gpt-image-2 isn't in the client's endpoint map,
  // so narrow the untyped payload by hand.
  const images = (data as Record<string, unknown>).images
  if (!Array.isArray(images) || images.length === 0) return null
  const first = images[0] as Record<string, unknown>
  return typeof first?.url === 'string' ? first.url : null
}

// BiRefNet returns a single `image` file, not an `images` array — its own narrowing.
function singleImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const image = (data as Record<string, unknown>).image
  if (!image || typeof image !== 'object') return null
  const url = (image as Record<string, unknown>).url
  return typeof url === 'string' ? url : null
}

/** Download a temporary fal-hosted file into memory (their URLs expire; callers persist the bytes). */
export async function downloadFalFile(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download generated file (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Generate one image with gpt-image-2 and return its temporary fal-hosted URL (~52s). The caller
 * downloads and re-uploads to our storage — the fal URL is never persisted.
 */
export async function generateSlideImage(prompt: string): Promise<string> {
  const result = await subscribeFal(FAL_MODEL, {
    prompt,
    image_size: FAL_IMAGE_SIZE,
    quality: 'medium',
    output_format: 'jpeg',
    num_images: 1,
  })
  const url = firstImageUrl(result.data)
  if (!url) throw new Error('fal-ai/gpt-image-2 returned no image')
  return url
}

/**
 * Cut the main subject out of an image (BiRefNet dichotomous segmentation, ~2–5s) and return the
 * temporary fal-hosted URL of the transparent-PNG cutout at the source image's dimensions.
 * Deliberately on DEFAULT settings: the Heavy/2048 variant proved MORE sensitive on stylized
 * art — it pulled in every salient graphic (icons, EKG lines, textures) instead of just the
 * subject. The default model selects decisively; edge finesse matters less than selection.
 */
export async function removeImageBackground(imageUrl: string): Promise<string> {
  const result = await subscribeFal(DIS_MODEL, { image_url: imageUrl, output_format: 'png' })
  const url = singleImageUrl(result.data)
  if (!url) throw new Error('fal-ai/birefnet/v2 returned no image')
  return url
}

/**
 * Generate a native SVG vector (Recraft V4, ~5–15s, ~$0.08) in the given palette and return its
 * temporary fal-hosted URL. `colors` steers generation toward the brand palette directly.
 */
export async function generateVectorAsset(prompt: string, colors: Rgb[]): Promise<string> {
  const result = await subscribeFal(VECTOR_MODEL, { prompt, image_size: 'square_hd', colors })
  const url = firstImageUrl(result.data)
  if (!url) throw new Error('fal-ai/recraft/v4/text-to-vector returned no image')
  return url
}

/** Host a transient file on fal's storage so an endpoint can read it (masks, prompts-by-image). */
export async function uploadFalTempFile(file: File): Promise<string> {
  ensureConfigured()
  return fal.storage.upload(file)
}

/**
 * Inpaint with gpt-image-2 edit (~30–60s): TRANSPARENT mask regions are repainted from the
 * prompt (the OpenAI edit alpha convention). The model still regenerates globally, so callers
 * composite the result back into the original to guarantee the pixels outside the mask.
 * Same model as generation — fills stay style-continuous.
 */
export async function editImageWithMask(input: {
  imageUrl: string
  maskUrl: string
  prompt: string
  width: number
  height: number
}): Promise<string> {
  const result = await subscribeFal(EDIT_MODEL, {
    image_urls: [input.imageUrl],
    mask_url: input.maskUrl,
    prompt: input.prompt,
    image_size: { width: input.width, height: input.height },
    quality: 'medium',
    output_format: 'jpeg',
    num_images: 1,
  })
  const url = firstImageUrl(result.data)
  if (!url) throw new Error('openai/gpt-image-2/edit returned no image')
  return url
}
