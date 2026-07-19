import { fal } from '@fal-ai/client'
import type { ImageConfig } from '@/lib/visual/vibe-presets'

/**
 * fal.ai provider seam (`FAL_API_KEY`, server-only). `generateImage` dispatches to a model-family adapter
 * (FLUX / Recraft) so a preset just declares its model — adding a preset needs no code here, and a new
 * model family is one adapter. Every call is fail-soft (no key or any error → null), so a slide degrades
 * to its palette gradient rather than hard-failing.
 */

const DEFAULT_RATIO: NonNullable<ImageConfig['ratio']> = '4:5'
const RATIO_SIZE: Record<NonNullable<ImageConfig['ratio']>, { width: number; height: number }> = {
  '4:5': { width: 1024, height: 1280 },
  '1:1': { width: 1024, height: 1024 },
}

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

type AdapterArgs = { prompt: string; seed?: number; config: ImageConfig }
type Adapter = (args: AdapterArgs) => Record<string, unknown>

// FLUX: exact size + seed (schnell is guidance-distilled — no negative prompt; it's folded into the positive).
const fluxAdapter: Adapter = ({ prompt, seed, config }) => ({
  prompt,
  image_size: RATIO_SIZE[config.ratio ?? DEFAULT_RATIO],
  num_images: 1,
  ...(seed != null ? { seed } : {}),
})

// Recraft v3: style-driven design/vector; takes `style` + size (no seed param).
const recraftAdapter: Adapter = ({ prompt, config }) => ({
  prompt,
  image_size: RATIO_SIZE[config.ratio ?? DEFAULT_RATIO],
  ...(config.style ? { style: config.style } : {}),
})

/** Pick the input adapter for a model id by family; defaults to FLUX-style input. */
function adapterFor(model: string): Adapter {
  if (model.includes('recraft')) return recraftAdapter
  return fluxAdapter
}

/** Generate one text-free backdrop image. `config` comes from the vibe preset; the no-text rule is folded
 *  into `prompt` by `buildBackdropPrompt`. Fail-soft → null keeps the gradient. */
export async function generateImage(args: {
  config: ImageConfig
  prompt: string
  seed?: number
}): Promise<{ url: string } | null> {
  if (!ensureConfigured()) return null
  const model = process.env.FAL_IMAGE_MODEL ?? args.config.model
  const input = adapterFor(model)({ ...args, config: { ...args.config, model } })
  try {
    const result = await fal.subscribe(model, { input })
    const url = firstImageUrl(result?.data)
    if (!url) {
      console.error(`[images/fal] generateImage: no url from "${model}":`, JSON.stringify(result?.data)?.slice(0, 300))
    }
    return url ? { url } : null
  } catch (err) {
    console.error(`[images/fal] generateImage failed ("${model}"):`, err)
    return null
  }
}
