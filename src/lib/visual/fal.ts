import { fal } from '@fal-ai/client'

const FAL_MODEL = 'fal-ai/gpt-image-2'
/** IG-safe square for both single posts and carousel slides. */
const IMAGE_SIZE = { width: 1024, height: 1024 }

let configured = false

function ensureConfigured(): void {
  if (configured) return
  const credentials = process.env.FAL_API_KEY
  if (!credentials) throw new Error('FAL_API_KEY is not set')
  // The client's default env var is FAL_KEY; ours is FAL_API_KEY, so credentials are passed explicitly.
  fal.config({ credentials })
  configured = true
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

/**
 * Generate one image with gpt-image-2 and return its temporary fal-hosted URL (~52s). The caller
 * downloads and re-uploads to our storage — the fal URL is never persisted.
 */
export async function generateSlideImage(prompt: string): Promise<string> {
  ensureConfigured()
  const result = await fal.subscribe(FAL_MODEL, {
    input: {
      prompt,
      image_size: IMAGE_SIZE,
      quality: 'medium',
      output_format: 'jpeg',
      num_images: 1,
    },
  })
  const url = firstImageUrl(result.data)
  if (!url) throw new Error('fal-ai/gpt-image-2 returned no image')
  return url
}
