import type { CanvasDoc } from '@/types/canvas'

/** One in-flight/finished AI visual for an in-memory wizard draft (no `posts` row yet).
 *  While composing, the entry stays `generating` but already carries the CLEAN image's refs —
 *  an approve mid-compose can attach the clean image (without a doc) instead of losing the slide. */
export interface DraftVisual {
  position: number
  status: 'generating' | 'done' | 'error'
  publicUrl?: string
  storagePath?: string
  /** The editable text-overlay state (auto-compose seeded it, or the editor saved it). */
  canvasDoc?: CanvasDoc
}

/** The visuals a draft can attach on approve (`POST /api/posts` images payload): anything with a
 *  stored file — `done` entries carry the flattened image + doc, mid-compose ones the clean image. */
export function completedDraftImages(
  visuals: DraftVisual[] | undefined
): Array<{ position: number; publicUrl: string; storagePath: string; canvasDoc?: CanvasDoc }> {
  return (visuals ?? [])
    .filter((v) => !!v.publicUrl && !!v.storagePath)
    .map((v) => ({
      position: v.position,
      publicUrl: v.publicUrl!,
      storagePath: v.storagePath!,
      ...(v.status === 'done' && v.canvasDoc ? { canvasDoc: v.canvasDoc } : {}),
    }))
}

/** Every storage path a draft owns (flattened files + docs' clean backgrounds) — discard cleanup. */
export function draftStoragePaths(visuals: DraftVisual[] | undefined): string[] {
  const paths = new Set<string>()
  for (const visual of visuals ?? []) {
    if (visual.storagePath) paths.add(visual.storagePath)
    if (visual.canvasDoc) paths.add(visual.canvasDoc.background.storagePath)
  }
  return [...paths]
}
