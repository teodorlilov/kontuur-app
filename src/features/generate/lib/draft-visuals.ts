/** One in-flight/finished AI visual for an in-memory wizard draft (no `posts` row yet). */
export interface DraftVisual {
  position: number
  status: 'generating' | 'done' | 'error'
  publicUrl?: string
  storagePath?: string
}

/** The subset of finished visuals a draft can attach on approve (`POST /api/posts` images payload). */
export function completedDraftImages(
  visuals: DraftVisual[] | undefined
): Array<{ position: number; publicUrl: string; storagePath: string }> {
  return (visuals ?? [])
    .filter((v) => v.status === 'done' && !!v.publicUrl && !!v.storagePath)
    .map((v) => ({ position: v.position, publicUrl: v.publicUrl!, storagePath: v.storagePath! }))
}
