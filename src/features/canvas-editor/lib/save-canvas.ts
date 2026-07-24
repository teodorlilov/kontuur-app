import { mapImageRow } from '@/features/publishing/lib/map-image-row'
import type { CanvasDoc } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'
import type { DraftVisualResult } from '../types'

function flattenedFile(blob: Blob, position: number): File {
  return new File([blob], `slide-${position + 1}.jpg`, { type: 'image/jpeg' })
}

/** The PUT's 409 stale-background guard fired — the image changed since the doc was loaded. */
export class StaleImageError extends Error {
  constructor() {
    super('The image changed since you opened the editor — reopen to edit the latest version.')
    this.name = 'StaleImageError'
  }
}

/** Save a persisted post's canvas: flattened jpeg + doc in one PUT (409 = image changed underneath). */
export async function savePostCanvas(
  postId: string,
  position: number,
  doc: CanvasDoc,
  blob: Blob,
  baseImagePath: string
): Promise<PostImage> {
  const formData = new FormData()
  formData.set('file', flattenedFile(blob, position))
  formData.set('position', String(position))
  formData.set('doc', JSON.stringify(doc))
  formData.set('baseImagePath', baseImagePath)
  const res = await fetch(`/api/posts/${postId}/canvas`, { method: 'PUT', body: formData })
  const body = (await res.json()) as { image?: PostImageRow; error?: string }
  if (res.status === 409) throw new StaleImageError()
  if (!res.ok || !body.image) throw new Error(body.error ?? 'Saving the design failed')
  return mapImageRow(body.image)
}

/** Upload a draft's flattened jpeg; the doc stays in wizard memory (returned with its new path). */
export async function saveDraftCanvas(
  target: { clientId: string; draftId: string; position: number },
  doc: CanvasDoc,
  blob: Blob,
  previousStoragePath?: string
): Promise<{ visual: DraftVisualResult; doc: CanvasDoc }> {
  const formData = new FormData()
  formData.set('file', flattenedFile(blob, target.position))
  formData.set('clientId', target.clientId)
  formData.set('draftId', target.draftId)
  formData.set('position', String(target.position))
  if (previousStoragePath) formData.set('previousStoragePath', previousStoragePath)
  const res = await fetch('/api/ai/generate-visual/upload', { method: 'POST', body: formData })
  const body = (await res.json()) as { publicUrl?: string; storagePath?: string; error?: string }
  if (!res.ok || !body.publicUrl || !body.storagePath) throw new Error(body.error ?? 'Saving the design failed')
  return {
    visual: { position: target.position, publicUrl: body.publicUrl, storagePath: body.storagePath },
    doc: { ...doc, flattenedStoragePath: body.storagePath },
  }
}
