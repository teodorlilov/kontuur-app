import type { PostImage } from '@/types/api'
import type { DraftVisual } from '@/lib/visual/draft-visuals'

/**
 * Projects persisted post images plus the client's in-flight visual jobs into
 * the DraftVisual slots the shared review leaves render. Mirrors the wizard's
 * semantics: a slot mid-compose stays `generating` but keeps the clean image's
 * refs, so approving mid-compose attaches the clean art instead of nothing.
 * A position with neither an image nor a job is omitted — VisualFrame renders
 * its empty state and Regenerate fills it.
 */
export function toVisualSlots(
  images: PostImage[],
  generatingPositions: number[],
  composingPositions: number[],
  totalSlots: number
): DraftVisual[] {
  const slots: DraftVisual[] = []
  for (let position = 0; position < totalSlots; position++) {
    const image = images.find((img) => img.position === position)
    const inFlight = generatingPositions.includes(position) || composingPositions.includes(position)
    if (image) {
      slots.push({
        position,
        status: inFlight ? 'generating' : 'done',
        publicUrl: image.publicUrl,
        storagePath: image.storagePath,
      })
    } else if (inFlight) {
      slots.push({ position, status: 'generating' })
    }
  }
  return slots
}
