import { validateImageFile } from '@/features/assets/lib/validate-image-file'
import { mapImageRow } from '@/lib/posts/map-image-row'
import type { PostImage } from '@/types/api'
import type { PostImageRow } from '@/types/index'

/**
 * Replace the image at a slide position with a file the user picked.
 *
 * Two surfaces did this — the slot's drop target and the review queue's replace — and only one
 * checked the file first. From the queue, an oversized image was uploaded in full and then refused
 * by the route, so the user waited for a transfer that was never going to be accepted.
 *
 * `validateImageFile` is the SAME check the route runs; this is a fast path in front of it, not a
 * substitute for it. The route stays the boundary — a caller can always skip this one.
 *
 * Returns the stored image, or throws with a message meant for a person. Callers decide whether
 * that becomes inline text or a toast.
 */
export async function uploadSlideImage(
  postId: string,
  position: number,
  file: File
): Promise<PostImage> {
  const fileError = validateImageFile(file)
  if (fileError) throw new Error(fileError)

  const form = new FormData()
  form.append('file', file)
  form.append('position', String(position))

  const res = await fetch(`/api/posts/${postId}/images`, { method: 'POST', body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Upload failed')

  return mapImageRow(data.image as PostImageRow)
}
