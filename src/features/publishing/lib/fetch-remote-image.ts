import { USER_AGENT_BROWSER } from '@/utils/constants'
import { readLimitedBytes } from '@/lib/sources/read-limited-text'
import { validateSourceUrl } from '@/lib/sources/validate-url'
import { isAllowedImageType, MAX_IMAGE_BYTES } from './validate-image-file'

const FETCH_TIMEOUT = 8000

/**
 * Download an image from an untrusted user-supplied URL (e.g. pasted from the web) for re-hosting.
 * SSRF-guarded, size-capped, and content-type-checked — a foreign URL must never be drawn on the
 * export canvas directly (it taints it), so callers persist these bytes to our own storage.
 */
export async function fetchRemoteImage(
  url: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!(await validateSourceUrl(url))) throw new Error('That URL cannot be fetched')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT_BROWSER },
    })
    if (!res.ok) throw new Error(`Could not download the image (HTTP ${res.status})`)

    const contentType =
      (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
    if (!isAllowedImageType(contentType))
      throw new Error("That link isn't a JPEG, PNG or WebP image")

    const buffer = await readLimitedBytes(res, MAX_IMAGE_BYTES)
    return { buffer, contentType }
  } finally {
    clearTimeout(timer)
  }
}
