/**
 * Canvas-doc domain types — the editable text-overlay state behind a flattened slide image.
 * The doc is the editing source of truth (stored in `post_canvas_docs.doc`, or wizard memory for
 * drafts); the flattened jpeg in `post_images` is the publish artifact derived from it.
 *
 * This is the v2 shape: one ordered `nodes` list. The v1 shape (separate `layers`/`elements` bands)
 * and the upgrade into this one live in `lib/canvas/doc-v1.ts`, which nothing but the parser reads.
 */

export type CanvasTextRole = 'headline' | 'body' | 'custom'

export type CanvasTextAlign = 'left' | 'center' | 'right'

export type CanvasFontWeight = 400 | 500 | 600 | 700

/** What every node has, whatever it draws. `kind` discriminates the union. */
export interface CanvasNodeBase {
  id: string
  x: number
  y: number
  /** Degrees around the node's top-left pivot; absent = 0 (never rotated). */
  rotation?: number
  /** 0..1; absent = 1. */
  opacity?: number
  /** Not drawn, and not baked into the exported image; still listed and selectable. */
  hidden?: boolean
  /** Cannot be dragged, resized or deleted on the canvas; still selectable from the layers list. */
  locked?: boolean
}

export interface CanvasTextNode extends CanvasNodeBase {
  kind: 'text'
  role: CanvasTextRole
  text: string
  /** Text wraps inside this width; height is derived by the renderer. */
  width: number
  /** Free string, not a library enum — docs must outlive font-library edits. */
  fontFamily: string
  fontSize: number
  fontWeight: CanvasFontWeight
  fill: string
  align: CanvasTextAlign
  lineHeight: number
  /** Render the text in capitals (applied at draw time — the stored text keeps its casing). */
  uppercase?: boolean
  /** Render in the family's italic face (the toolbar only offers it for families hosting one). */
  italic?: boolean
  /** Marker-highlight band colour (hex) drawn behind each line; absent = no highlight. */
  highlight?: string
  /** Set when the user hand-edits the text in the editor; recompose then keeps their wording. */
  textOverridden?: boolean
}

/**
 * A placed raster or vector asset (cutouts, logos, generated vectors). Both kinds render
 * identically; 'svg' stays distinct for future palette recolouring.
 */
export interface CanvasImageNode extends CanvasNodeBase {
  kind: 'image' | 'svg'
  src: { publicUrl: string; storagePath: string }
  width: number
  height: number
  /**
   * Mirror about the node's own vertical/horizontal axis. Image-only: a text node's height is
   * derived by the renderer, so it has no stored extent to mirror around.
   */
  flipX?: boolean
  flipY?: boolean
}

export type CanvasShapeKind = 'rect' | 'ellipse' | 'line'

/**
 * A drawn primitive — no file behind it, so it paints on the first frame.
 *
 * Geometry: `rect` fills the box; `ellipse` is inscribed in it; `line` is the box's TOP EDGE, so
 * its angle comes from `rotation` (which the base already carries and the Transformer already
 * folds) rather than from a pair of endpoints. Endpoints were rejected deliberately: Konva's
 * Transformer decomposes to x/y/scale/rotation, so a points-based line would need its own fold,
 * its own bounding box and its own snapping to express what rotation already says.
 */
export interface CanvasShapeNode extends CanvasNodeBase {
  kind: CanvasShapeKind
  /** The node's box, top-left at (x, y) — the same pair image nodes use, so the transform fold,
   *  snapping, marquee and multi-drag need no shape-specific case. */
  width: number
  height: number
  /** #rrggbb; absent = unfilled. An outline-only rect is a real object, and a line has no fill. */
  fill?: string
  /** Outline colour; absent = no outline. A `line` is nothing but this. */
  stroke?: string
  /** Authoring px. Separate from `stroke` because a colour with no width draws nothing. */
  strokeWidth?: number
  /** Rect only — one optional number is not worth forking the union, the schema and both renderers. */
  cornerRadius?: number
}

export type CanvasNode = CanvasTextNode | CanvasImageNode | CanvasShapeNode

export type CanvasScrimMode = 'full' | 'bottom'

/** The contrast band drawn between the background and the nodes. */
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

export interface CanvasDoc {
  version: 2
  canvas: { w: number; h: number }
  background: CanvasBackgroundRef
  backgroundTransform?: CanvasBackgroundTransform
  /** The artifact the last save produced — lets the editor detect its own baked output on reopen. */
  flattenedStoragePath: string | null
  scrim: CanvasScrim
  /**
   * Render order, bottom first. One list for every kind, so a picture can sit above one text layer
   * and below another — in v1 typography was pinned above the asset band by construction.
   */
  nodes: CanvasNode[]
}
