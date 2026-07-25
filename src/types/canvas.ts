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
  /** Degrees around the layer's top-left pivot; absent = 0 (never rotated). */
  rotation?: number
  /** Render the text in capitals (applied at draw time — the stored text keeps its casing). */
  uppercase?: boolean
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

/**
 * Pan/zoom of the clean background inside the canvas; absent = centered cover fit. Offsets are
 * fractions of the crop slack (0.5 = centered), so the transform is valid for any source size.
 */
export interface CanvasBackgroundTransform {
  /** 1 = exact cover fit, up to 3. */
  zoom: number
  offsetX: number
  offsetY: number
}

/**
 * A placed asset in the band between the scrim and the text layers (cutouts, logos, generated
 * vectors). z-order = array order; typography always renders above by construction.
 */
export interface CanvasElement {
  id: string
  /** Rendering is identical for both; 'svg' stays distinct for future palette recolouring. */
  kind: 'image' | 'svg'
  src: { publicUrl: string; storagePath: string }
  x: number
  y: number
  width: number
  height: number
  /** Degrees around the element's top-left pivot; absent = 0. */
  rotation?: number
  /** 0..1; absent = 1. */
  opacity?: number
  /** Renders in FRONT of the text band (opt-in per element — the subject-overlaps-headline effect). */
  aboveText?: boolean
}

export interface CanvasDoc {
  version: 1
  canvas: { w: number; h: number }
  background: CanvasBackgroundRef
  backgroundTransform?: CanvasBackgroundTransform
  /** The artifact the last save produced — lets the editor detect its own baked output on reopen. */
  flattenedStoragePath: string | null
  scrim: CanvasScrim
  elements?: CanvasElement[]
  layers: CanvasTextLayer[]
}
