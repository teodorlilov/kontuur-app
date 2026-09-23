import { mapImageRow } from '@/lib/posts/map-image-row'
import type { CanvasDoc } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

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
