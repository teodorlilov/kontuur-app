import type { EditorTarget } from '../types'
import type { SlideCopy } from '@/lib/posts/slide-copy'

export interface AssetRef {
  publicUrl: string
  storagePath: string
}

/** Unwrap an upload/generate response into its stored asset, or throw the server's reason. */
export async function parseAssetResponse(
  res: Response,
  fallbackError: string
): Promise<AssetRef & { width?: number; height?: number }> {
  const body = (await res.json()) as {
    publicUrl?: string
    storagePath?: string
    width?: number
    height?: number
    error?: string
  }
  if (!res.ok || !body.publicUrl || !body.storagePath) throw new Error(body.error ?? fallbackError)
  return {
    publicUrl: body.publicUrl,
    storagePath: body.storagePath,
    width: body.width,
    height: body.height,
  }
}

// The asset routes address a persisted post by id, or an in-memory draft by client + draft ids.
function targetIds(target: EditorTarget): Record<string, string> {
  return target.kind === 'post'
    ? { postId: target.postId }
    : { clientId: target.clientId, draftId: target.draftId }
}

/** Upload a user-picked element asset for the editor's target; returns the stored ref. */
export async function uploadElementAsset(target: EditorTarget, file: File): Promise<AssetRef> {
  const formData = new FormData()
  formData.set('file', file)
  for (const [key, value] of Object.entries(targetIds(target))) formData.set(key, value)
  const res = await fetch('/api/ai/canvas-asset', { method: 'POST', body: formData })
  return parseAssetResponse(res, 'Asset upload failed')
}

/** Re-host an image pasted/dropped from an external URL for the editor's target; returns the ref. */
export async function pasteFromUrlAsset(target: EditorTarget, url: string): Promise<AssetRef> {
  const res = await fetch('/api/ai/paste-from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...targetIds(target), url }),
  })
  return parseAssetResponse(res, 'Paste failed')
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
  return parseAssetResponse(res, 'Subject isolation failed')
}

/** Generate a brand-palette SVG element asset; returns the stored ref + natural dimensions. */
export async function generateSvgAsset(
  target: EditorTarget,
  prompt: string
): Promise<AssetRef & { width: number; height: number }> {
  const res = await fetch('/api/ai/generate-svg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...targetIds(target), prompt }),
  })
  const asset = await parseAssetResponse(res, 'Vector generation failed')
  // The route always reports dimensions (with its own square fallback) — absence means a bad response.
  if (asset.width === undefined || asset.height === undefined)
    throw new Error('Vector generation failed')
  return { ...asset, width: asset.width, height: asset.height }
}

/**
 * Generate a fresh background for the slide being edited; returns the stored ref. The slide's copy
 * travels with the request because the server cannot re-derive it — a wizard draft has no row, and
 * a post's row can be behind unsaved edits.
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
      // A draft's colour pair travels with the request; a post's is read from its row server-side.
      ...(input.target.kind === 'draft' && input.target.scheme
        ? { scheme: input.target.scheme }
        : {}),
      ...(input.nonce ? { nonce: input.nonce } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
    }),
    signal: input.signal,
  })
  return parseAssetResponse(res, 'Background generation failed')
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
  return parseAssetResponse(res, 'Inpainting failed')
}
