import type { EditorTarget, SlideCopy } from '../types'

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
  direction?: string
  signal?: AbortSignal
}): Promise<AssetRef> {
  const res = await fetch('/api/ai/generate-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...targetIds(input.target),
      slideCopy: input.slideCopy,
      ...(input.direction ? { direction: input.direction } : {}),
    }),
    signal: input.signal,
  })
  return parseAssetResponse(res, 'Background generation failed')
}

/** Inpaint the masked region of the clean background; returns the new clean image ref. */
export async function inpaintBackgroundAsset(input: {
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
