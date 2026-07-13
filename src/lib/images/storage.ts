import { uploadToBucket, type UploadResult } from '@/features/publishing/lib/storage'

/** Generated plates live in a public bucket; fal's hosted URLs are ephemeral, so we always copy them here. */
const BUCKET = 'plates'

/**
 * Copy a generated image (fal's URL is ephemeral) into our durable public `plates` bucket under `prefix`
 * — a client id for posts, `onboarding/<nonce>` for the onboarding design system. Shared by the post
 * plate bank and the onboarding endpoint. Fail-soft → null (caller keeps the gradient). Kept free of the
 * LLM/provider imports so both server callers and tests can use it without the AI client.
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
