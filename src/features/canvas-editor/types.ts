import type { CanvasDoc } from '@/types/canvas'
import type { PostImage } from '@/types/api'
import type { SlideCopy } from '@/lib/posts/slide-copy'
import type { ColorScheme } from '@/lib/visual/color-scheme'

/** The editor's exclusive interaction modes; 'edit' is normal layer editing. */
/**
 * `inpaint` and `repair` are the same gesture on different targets: paint a zone, say what belongs
 * there. One edits the slide's picture, the other the selected cut-out. They are separate modes
 * rather than one mode with a target flag, because the target decides whether entering the tool may
 * clear the selection — and a flag that changes that is exactly the kind of thing a later reader
 * reads past.
 */
export type EditorMode = 'edit' | 'reposition' | 'inpaint' | 'repair' | 'lasso' | 'erase'

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
  /**
   * A draft carries its colour pair, because nothing on the server can look it up — a draft has no
   * row until approve. A post does not need to: the route reads its stored pair, which is the
   * authoritative copy and cannot be stale the way a prop can.
   */
  | { kind: 'draft'; clientId: string; draftId: string; scheme?: ColorScheme }

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
}
