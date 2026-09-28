import type { PostImage } from '@/types/api'

/** Replace-or-insert an image at its position, keeping the list position-sorted. */
export function upsertImageAtPosition(images: PostImage[], image: PostImage): PostImage[] {
  return [...images.filter((img) => img.position !== image.position), image].sort(
    (a, b) => a.position - b.position
  )
}
