import type { CanvasDoc } from '@/types/canvas'
import type { PostImage } from '@/types/api'

/** What the editor saves against: a persisted post row, or an in-memory wizard draft. */
export type EditorTarget =
  | { kind: 'post'; postId: string; position: number }
  | { kind: 'draft'; clientId: string; draftId: string; position: number; doc: CanvasDoc | null }

/** The copy that seeds a first-time doc: a carousel slide's fields, or a single post's caption. */
export type SlideCopy =
  | { kind: 'slide'; headline: string; body: string }
  | { kind: 'caption'; caption: string | null }

export interface DraftVisualResult {
  position: number
  publicUrl: string
  storagePath: string
}

export interface CanvasEditorProps {
  target: EditorTarget
  /** The image currently shown at this position — the editor's stale-save guard and seed background. */
  image: { publicUrl: string; storagePath: string }
  slideCopy: SlideCopy | null
  /** Top-bar label, e.g. "Slide 2 of 6". */
  slideLabel: string
  onClose: () => void
  /** Persisted-post save result (the fresh post_images row, mapped). */
  onSaved?: (image: PostImage) => void
  /** Draft save result: the flattened upload + the doc to hold in wizard memory. */
  onSavedDraft?: (visual: DraftVisualResult, doc: CanvasDoc) => void
}
