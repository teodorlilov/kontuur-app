import { fal } from '@fal-ai/client'
import { RATIO_SIZES, type AspectRatio } from '@/lib/renderer/layout/anchor'

/**
 * The fal.ai provider seam. `generatePlate` produces one background image via a Flux model server-side
 * (key `FAL_API_KEY`, never `NEXT_PUBLIC_`). It is deliberately fail-soft: no key or any error returns
 * null, and the caller falls back to the composition's token gradient — a slide never hard-fails on an
 * imagery problem. Model is overridable via `FAL_IMAGE_MODEL` for easy A/B without a code change.
 */

// FLUX.1 [schnell] — fast + cheap (~1-4 steps), good for backgrounds. The default; swap via env.
const DEFAULT_MODEL = 'fal-ai/flux/schnell'

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
