import { isImageNode } from '@/lib/canvas/doc-nodes'
import type { ColorScheme } from '@/lib/visual/color-scheme'
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
  /** The colour pair this draft's art was generated on, echoed back by the route. */
  scheme?: ColorScheme
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

/**
 * The colour scheme this draft's art was built on.
 *
 * Every visual of one draft carries the same pair — the route derives it from the draft id — so the
 * first one that has it answers for the whole draft. Undefined when no visual generated; the post
 * then picks its own the first time it generates anything.
 *
 * Two readers, deliberately one function: the approve payload, so the post owns the colours its
 * images already wear, and a regenerate, so a rerolled slide stays with its siblings instead of
 * being re-picked at a different offset.
 */
export function draftScheme(visuals: DraftVisual[] | undefined): ColorScheme | undefined {
  return visuals?.find((visual) => visual.scheme)?.scheme
}

/** The same answer as a spreadable patch, for the writers that rebuild an entry from a bare file. */
export function schemeOf(visuals: DraftVisual[] | undefined): Pick<DraftVisual, 'scheme'> {
  const scheme = draftScheme(visuals)
  return scheme ? { scheme } : {}
}

/** Per-draft visual tallies for status chips and the review bar's note. */
export function countVisualsByStatus(visuals: DraftVisual[] | undefined): {
  failed: number
  composing: number
  done: number
} {
  let failed = 0
  let composing = 0
  let done = 0
  for (const visual of visuals ?? []) {
    if (visual.status === 'error') failed++
    else if (visual.status === 'generating') composing++
    else done++
  }
  return { failed, composing, done }
}

/** Every storage path a draft owns (flattened files, docs' clean backgrounds, placed assets) —
 *  discard cleanup. */
export function draftStoragePaths(visuals: DraftVisual[] | undefined): string[] {
  const paths = new Set<string>()
  for (const visual of visuals ?? []) {
    if (visual.storagePath) paths.add(visual.storagePath)
    if (!visual.canvasDoc) continue
    paths.add(visual.canvasDoc.background.storagePath)
    for (const node of visual.canvasDoc.nodes) {
      if (isImageNode(node)) paths.add(node.src.storagePath)
    }
  }
  return [...paths]
}
