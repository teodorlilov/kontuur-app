import type { PostImage } from '@/types/api'

/** Replace-or-insert an image at its position, keeping the list position-sorted. */
export function upsertImageAtPosition(images: PostImage[], image: PostImage): PostImage[] {
  return [...images.filter((img) => img.position !== image.position), image].sort(
    (a, b) => a.position - b.position
  )
}

/** Slot positions with no image that aren't already generating — the ones a bulk generate should fire. */
export function missingImagePositions(
  images: PostImage[],
  totalSlots: number,
  generatingPositions: number[]
): number[] {
  return Array.from({ length: totalSlots }, (_, i) => i).filter(
    (position) =>
      !images.some((img) => img.position === position) && !generatingPositions.includes(position)
  )
}
