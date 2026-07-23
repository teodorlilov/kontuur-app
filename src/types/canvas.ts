/**
 * Canvas-doc domain types — the editable text-overlay state behind a flattened slide image.
 * The doc is the editing source of truth (stored in `post_canvas_docs.doc`, or wizard memory for
 * drafts); the flattened jpeg in `post_images` is the publish artifact derived from it.
 */

export type CanvasTextRole = 'headline' | 'body' | 'custom'

export type CanvasTextAlign = 'left' | 'center' | 'right'

export type CanvasFontWeight = 400 | 500 | 600 | 700

export interface CanvasTextLayer {
  id: string
  role: CanvasTextRole
  text: string
  x: number
  y: number
  /** Text wraps inside this width; height is derived by the renderer. */
  width: number
  /** Free string, not a library enum — docs must outlive font-library edits. */
  fontFamily: string
  fontSize: number
  fontWeight: CanvasFontWeight
  fill: string
  align: CanvasTextAlign
  lineHeight: number
  /** Set when the user hand-edits the text in the editor; recompose then keeps their wording. */
  textOverridden?: boolean
}

export type CanvasScrimMode = 'full' | 'bottom'

/** The contrast band drawn between the background and the text layers. */
export interface CanvasScrim {
  enabled: boolean
  color: string
  opacity: number
  mode: CanvasScrimMode
}

/** Storage reference to the CLEAN (text-free) image the doc composes over. */
export interface CanvasBackgroundRef {
  publicUrl: string
  storagePath: string
}

export interface CanvasDoc {
  version: 1
  canvas: { w: number; h: number }
  background: CanvasBackgroundRef
  /** The artifact the last save produced — lets the editor detect its own baked output on reopen. */
  flattenedStoragePath: string | null
  scrim: CanvasScrim
  layers: CanvasTextLayer[]
}
