import { uploadToBucket, type UploadResult } from '@/features/publishing/lib/storage'

// Generated backdrops live in a public bucket; fal's hosted URLs are ephemeral, so we always copy them here.
const BUCKET = 'plates'

/**
 * Copy a generated image (fal's URL is ephemeral) into our durable public `plates` bucket under `prefix`
 * (the client id). The durable `publicUrl` is what lands in `brand_image_bank` + the slide. Fail-soft →
 * null (caller keeps the gradient). Free of AI/provider imports so callers and tests can use it standalone.
 */
export async function uploadPlate(prefix: string, url: string): Promise<UploadResult | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const bytes = Buffer.from(await res.arrayBuffer())
    const ext = contentType.includes('png') ? 'png' : 'jpg'
    const storagePath = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    return await uploadToBucket(BUCKET, storagePath, bytes, contentType)
  } catch (err) {
    console.error('[images/storage] uploadPlate failed:', err)
    return null
  }
}
