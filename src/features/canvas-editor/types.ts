import type { CanvasDoc } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import type { SlideText } from '@/types/slide'

/** The editor's exclusive interaction modes; 'edit' is normal layer editing. */
export type EditorMode = 'edit' | 'reposition' | 'inpaint' | 'lasso' | 'erase'

/** One committed brush stroke in canvas space (flat x,y pairs, Konva Line convention). */
export interface BrushStroke {
  points: number[]
  size: number
}

/**
 * What the editor saves against: a persisted post row, or an in-memory wizard draft.
 *
 * The target names the POST, not a slide of it — the editor moves between slides on its own, so a
 * position here would be a second, contradictable answer to "which slide am I editing".
 */
export type EditorTarget =
  | { kind: 'post'; postId: string }
  | { kind: 'draft'; clientId: string; draftId: string }

/** The copy that seeds a first-time doc: a carousel slide's fields, or a single post's caption. */
export type SlideCopy =
  | ({ kind: 'slide' } & SlideText)
  | { kind: 'caption'; caption: string | null }

export interface DraftVisualResult {
  position: number
  publicUrl: string
  storagePath: string
}

/** One slide the editor can move between. Ascending by position; a single post has exactly one. */
export interface EditorSlide {
  position: number
  /** The image currently shown here — the editor's stale-save guard and seed background. */
  image: { publicUrl: string; storagePath: string }
  slideCopy: SlideCopy | null
  /** A wizard draft carries its doc in memory; a post target leaves this unset and loads its own. */
  doc?: CanvasDoc | null
}

export interface CanvasEditorProps {
  target: EditorTarget
  slides: EditorSlide[]
  /** Which slide opens first — the one the user clicked. */
  initialPosition: number
  onClose: () => void
  /** Persisted-post save result (the fresh post_images row, mapped). */
  onSaved?: (image: PostImage) => void
  /** Draft save result: the flattened upload + the doc to hold in wizard memory. */
  onSavedDraft?: (visual: DraftVisualResult, doc: CanvasDoc) => void
  /**
   * Enables "Save & apply to all": every dirty slide saves, then the surface receives the ACTIVE
   * slide's doc and the position it came from, and carries that look onto the others server-side.
   * That hands authority over every sibling doc back to the surface, so this path — unlike a plain
   * Save — still closes the editor.
   *
   * `images` is the file at each position AS OF the save that just ran. The surface's own copy is
   * a render-time snapshot from before it, and every sibling this call restyles is guarded against
   * the path it was opened with — so passing the stale one makes each just-saved sibling 409 and
   * be skipped in silence.
   */
  onApplyToAll?: (
    doc: CanvasDoc,
    position: number,
    images: Map<number, { publicUrl: string; storagePath: string }>
  ) => void
}
