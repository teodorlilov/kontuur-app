import type { PostImage } from '@/types/api'
import type { DraftVisual } from '@/lib/visual/draft-visuals'

/**
 * Projects a post's images plus the visuals hook's in-flight and failed positions into the
 * DraftVisual slots the shared review leaves render — the queue's, the generate flow's, one
 * projection. A slot mid-compose stays `generating` but keeps the clean image's refs, so a
 * reviewer looking at it sees the art that exists rather than nothing. A position whose last
 * generation failed is `error` (with whatever image it still has), so the slot offers Retry. A
 * position with neither an image nor a job is omitted — VisualFrame renders its empty state and
 * Regenerate fills it.
 */
export function toVisualSlots(
  images: PostImage[],
  generatingPositions: number[],
  composingPositions: number[],
  failedPositions: number[],
  totalSlots: number
): DraftVisual[] {
  const slots: DraftVisual[] = []
  for (let position = 0; position < totalSlots; position++) {
    const image = images.find((img) => img.position === position)
    const inFlight = generatingPositions.includes(position) || composingPositions.includes(position)
    const failed = !inFlight && failedPositions.includes(position)
    if (image) {
      slots.push({
        position,
        status: inFlight ? 'generating' : failed ? 'error' : 'done',
        publicUrl: image.publicUrl,
        storagePath: image.storagePath,
      })
    } else if (inFlight) {
      slots.push({ position, status: 'generating' })
    } else if (failed) {
      slots.push({ position, status: 'error' })
    }
  }
  return slots
}
