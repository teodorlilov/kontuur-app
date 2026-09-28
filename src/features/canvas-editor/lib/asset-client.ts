import { z } from 'zod'
import type { EditorTarget } from '../types'
import type { SlideCopy } from '@/lib/posts/slide-copy'
import { readRouteBody } from '@/utils/read-route-body'

export interface AssetRef {
  publicUrl: string
  storagePath: string
}

/**
 * What every asset route answers on success; only generate-svg reports the dimensions. Read
 * through `readRouteBody`, which throws the route's reason, or the caller's fallback when a failure
 * carries none or a success names no stored file.
 */
const assetResponseSchema = z.object({
  publicUrl: z.string().min(1),
  storagePath: z.string().min(1),
  width: z.number().optional(),
  height: z.number().optional(),
})

// The asset routes address the post by id; ownership is theirs to check.
function targetIds(target: EditorTarget): Record<string, string> {
  return { postId: target.postId }
}

/** Upload a user-picked element asset for the editor's target; returns the stored ref. */
export async function uploadElementAsset(target: EditorTarget, file: File): Promise<AssetRef> {
  const formData = new FormData()
  formData.set('file', file)
  for (const [key, value] of Object.entries(targetIds(target))) formData.set(key, value)
  const res = await fetch('/api/ai/canvas-asset', { method: 'POST', body: formData })
  return readRouteBody(res, assetResponseSchema, 'Asset upload failed')
}

/** Re-host an image pasted/dropped from an external URL for the editor's target; returns the ref. */
export async function pasteFromUrlAsset(target: EditorTarget, url: string): Promise<AssetRef> {
  const res = await fetch('/api/ai/paste-from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...targetIds(target), url }),
  })
  return readRouteBody(res, assetResponseSchema, 'Paste failed')
}

/** Cut the main subject out of the doc's clean background; returns the stored cutout ref. */
export async function isolateSubjectAsset(
  target: EditorTarget,
  storagePath: string
): Promise<AssetRef> {
  const res = await fetch('/api/ai/isolate-subject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...targetIds(target), storagePath }),
  })
  return readRouteBody(res, assetResponseSchema, 'Subject isolation failed')
}

/**
 * Generate a brand-palette SVG element asset; returns the stored ref + natural dimensions. The
 * route always reports dimensions, falling back to `FALLBACK_SVG_SIZE`
 * (src/app/api/ai/generate-svg/route.ts), so a success without them is a bad response and throws.
 */
export async function generateSvgAsset(
  target: EditorTarget,
  prompt: string
): Promise<AssetRef & { width: number; height: number }> {
  const res = await fetch('/api/ai/generate-svg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...targetIds(target), prompt }),
  })
  const asset = await readRouteBody(res, assetResponseSchema, 'Vector generation failed')
  if (asset.width === undefined || asset.height === undefined)
    throw new Error('Vector generation failed')
  return { ...asset, width: asset.width, height: asset.height }
}

/**
 * Generate a fresh background for the slide being edited; returns the stored ref. The slide's copy
 * travels with the request because the server cannot re-derive it — the post's row can be behind
 * unsaved edits.
 *
 * The only wire call that takes a signal: it is the only one that runs long enough (~52s) for
 * cancelling to mean anything. Aborting abandons the response, not the server's work — the image
 * still generates and lands in storage, which TECH-DEBT §2.8 accepts as an orphan.
 */
export async function generateBackgroundAsset(input: {
  target: EditorTarget
  slideCopy: SlideCopy | null
  /** Where this slide sits, so the model gets its real role rather than a hardcoded guess. */
  position: number
  total: number
  /** What makes this press compose differently from the last — see `backgroundNonce`. */
  nonce?: string
  direction?: string
  signal?: AbortSignal
}): Promise<AssetRef> {
  const res = await fetch('/api/ai/generate-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...targetIds(input.target),
      slideCopy: input.slideCopy,
      position: input.position,
      total: input.total,
      ...(input.nonce ? { nonce: input.nonce } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
    }),
    signal: input.signal,
  })
  return readRouteBody(res, assetResponseSchema, 'Background generation failed')
}

/**
 * Repaint the masked region of any stored image the client owns — the slide's background or a
 * picture placed on it — and return the model's raw output as a stored ref.
 *
 * Raw, not final: gpt-image edits regenerate the WHOLE frame, so every caller composites the result
 * back into the original through the same region it masked. See `compositeEditedRegion`.
 */
export async function inpaintAsset(input: {
  target: EditorTarget
  storagePath: string
  prompt: string
  mask: Blob
  width: number
  height: number
}): Promise<AssetRef> {
  const formData = new FormData()
  formData.set('mask', new File([input.mask], 'mask.png', { type: 'image/png' }))
  formData.set('prompt', input.prompt)
  formData.set('storagePath', input.storagePath)
  formData.set('width', String(input.width))
  formData.set('height', String(input.height))
  for (const [key, value] of Object.entries(targetIds(input.target))) formData.set(key, value)
  const res = await fetch('/api/ai/inpaint', { method: 'POST', body: formData })
  return readRouteBody(res, assetResponseSchema, 'Inpainting failed')
}
