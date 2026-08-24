import type {
  CanvasBackdrop,
  CanvasBackgroundTransform,
  CanvasImageNode,
  CanvasShapeNode,
  CanvasTextAlign,
  CanvasTextNode,
} from '@/types/canvas'
import { coverCrop, type CropAttrs } from './cover-crop'

interface TextGroupAttrs {
  x: number
  y: number
  /** Degrees around the group's top-left origin (Konva default pivot). */
  rotation: number
  /** On the GROUP so bands and glyphs fade together, matching `nodeGroupAttrs` for other kinds. */
  opacity: number
}

/**
 * Position attrs for the group wrapping one text layer (highlight bands + glyphs move as one
 * node); the text child itself sits at the group origin with only the glyph attrs below.
 */
export function textGroupAttrs(node: CanvasTextNode): TextGroupAttrs {
  return { x: node.x, y: node.y, rotation: node.rotation ?? 0, opacity: node.opacity ?? 1 }
}

interface TextNodeAttrs {
  width: number
  text: string
  fontFamily: string
  fontSize: number
  /** Konva expresses style+weight through fontStyle strings ('bold' | 'italic 500' | …). */
  fontStyle: string
  fill: string
  align: CanvasTextAlign
  lineHeight: number
  wrap: 'word'
  letterSpacing: number
  shadowColor: string | undefined
  shadowOpacity: number
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  stroke: string | undefined
  strokeWidth: number
  /** Fill LAST, so an outline rings the glyph instead of eating half its width out of it. */
  fillAfterStrokeEnabled: boolean
}

// Konva folds this straight into ctx.font, so 'italic', 'italic bold' and 'italic 500' all work.
function fontStyleFor(node: CanvasTextNode): string {
  const weight =
    node.fontWeight === 400 ? '' : node.fontWeight === 700 ? 'bold' : String(node.fontWeight)
  if (!node.italic) return weight || 'normal'
  return weight ? `italic ${weight}` : 'italic'
}

/**
 * Glyph attrs for one text node (position lives on the group) — editor stage + exporter.
 *
 * TOTAL on purpose: every key is always present, never conditionally spread. `measure-fit.ts` holds
 * ONE module-level `Konva.Text` and reconfigures it per node with `setAttrs`, which only writes the
 * keys it is given — so an omitted `letterSpacing` leaves the PREVIOUS node's spacing in place and
 * the next node measures wrong. That misfires autofit, the overflow warning and the marker bands at
 * once, and only in a particular z-order. The two renderers are immune (react-konva resets dropped
 * props, the exporter builds a fresh Text per node), so it would never show up as a draw bug.
 */
export function textNodeAttrs(node: CanvasTextNode): TextNodeAttrs {
  return {
    width: node.width,
    // Konva has no textTransform — capitals are applied to the drawn string, not the stored one.
    text: node.uppercase ? node.text.toUpperCase() : node.text,
    fontFamily: node.fontFamily,
    fontSize: node.fontSize,
    fontStyle: fontStyleFor(node),
    fill: node.fill,
    align: node.align,
    lineHeight: node.lineHeight,
    wrap: 'word',
    letterSpacing: node.letterSpacing ?? 0,
    // An absent colour is how "no shadow" is said — Konva's hasShadow() is false without one.
    shadowColor: node.shadowColor,
    shadowOpacity: node.shadowOpacity ?? 1,
    shadowBlur: node.shadowBlur ?? 0,
    shadowOffsetX: node.shadowOffsetX ?? 0,
    shadowOffsetY: node.shadowOffsetY ?? 0,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth ?? 0,
    // Konva's default paints the stroke OVER the glyph, so half the outline's width is taken out
    // of the letterform and a 4px outline reads as a 2px one on thinning type.
    fillAfterStrokeEnabled: true,
  }
}

interface NodeGroupAttrs {
  x: number
  y: number
  rotation: number
  opacity: number
}

/**
 * Position attrs for the group wrapping one placed asset or drawn shape. The group — never the
 * child — is what the Transformer resizes, for the same reason text uses one.
 *
 * A mirror CANNOT live on the transform target. Konva decomposes a gesture's matrix back onto the
 * node (Transformer.js → Util.js `decompose`, konva 10.3.0), and that decomposition can only ever
 * return a positive scaleX: a mirror comes back as `scaleY < 0` plus a ∓180° rotation. The size
 * fold in `image-node.tsx` would then read a negative scaleY, clamp the height to MIN_ELEMENT_SIZE,
 * and the flip would be gone. Keeping the mirror on the child means the Transformer only ever sees
 * an ordinary positive-scale node.
 */
export function nodeGroupAttrs(node: CanvasImageNode | CanvasShapeNode): NodeGroupAttrs {
  return {
    x: node.x,
    y: node.y,
    rotation: node.rotation ?? 0,
    opacity: node.opacity ?? 1,
  }
}

interface ImageBitmapAttrs {
  width: number
  height: number
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

/**
 * Bitmap attrs for one placed asset: the mirror, expressed so the node's box does not move.
 *
 * Konva maps a local point u to `x + scale * (u - offset)`. With scale −1 and the offset on the FAR
 * edge, that is `x + (width - u)`, which folds [0, width] back onto itself — the flip happens
 * strictly inside the node's own box, so x/y keep meaning "top-left of the unflipped box" and the
 * rotation pivot stays put. An offset of width/2 would mirror correctly but silently move the pivot
 * to the centre, tilting every rotated node about a different point than before.
 *
 * Returned in full rather than conditionally, so the attrs are a pure function of the node and the
 * exporter and the stage cannot drift.
 */
export function imageBitmapAttrs(node: CanvasImageNode): ImageBitmapAttrs {
  return {
    width: node.width,
    height: node.height,
    scaleX: node.flipX ? -1 : 1,
    scaleY: node.flipY ? -1 : 1,
    offsetX: node.flipX ? node.width : 0,
    offsetY: node.flipY ? node.height : 0,
  }
}

interface ShapeChildAttrs {
  width: number
  height: number
  /** Konva reads this only on Ellipse; harmless elsewhere, and it keeps one attr shape. */
  offsetX: number
  offsetY: number
  fill: string | undefined
  stroke: string | undefined
  strokeWidth: number
  cornerRadius: number
  /** `line` only: the box's top edge, so the angle is the node's rotation. */
  points: number[]
}

/**
 * Child attrs for one drawn shape — the single resolver the stage and the offscreen exporter both
 * read, so a rect can never be drawn two different ways.
 *
 * The ellipse offset is what keeps the GROUP origin at the box's top-left: Konva draws an Ellipse
 * from its centre, so without it the node's x/y would mean something different for one kind than
 * for every other, and snapping, marquee and the layers list would all disagree about where it is.
 */
export function shapeChildAttrs(node: CanvasShapeNode): ShapeChildAttrs {
  return {
    width: node.width,
    height: node.height,
    offsetX: node.kind === 'ellipse' ? -node.width / 2 : 0,
    offsetY: node.kind === 'ellipse' ? -node.height / 2 : 0,
    fill: node.kind === 'line' ? undefined : node.fill,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth ?? 0,
    cornerRadius: node.kind === 'rect' ? (node.cornerRadius ?? 0) : 0,
    points: [0, 0, node.width, 0],
  }
}

interface BackdropNodeAttrs {
  x: number
  y: number
  width: number
  height: number
  fill: string
  opacity: number
}

/** Konva attrs for the backdrop rect; null when the backdrop is off. */
export function backdropNodeAttrs(
  backdrop: CanvasBackdrop,
  canvas: { w: number; h: number }
): BackdropNodeAttrs | null {
  if (!backdrop.enabled) return null
  return {
    x: 0,
    y: 0,
    width: canvas.w,
    height: canvas.h,
    fill: backdrop.color,
    opacity: backdrop.opacity,
  }
}

interface BackgroundNodeAttrs extends CropAttrs {
  x: number
  y: number
  width: number
  height: number
}

/** Konva attrs for the background image: canvas-filling cover-crop, panned/zoomed when set. */
export function backgroundNodeAttrs(
  src: { width: number; height: number },
  canvas: { w: number; h: number },
  transform?: CanvasBackgroundTransform
): BackgroundNodeAttrs {
  return {
    x: 0,
    y: 0,
    width: canvas.w,
    height: canvas.h,
    ...coverCrop(src.width, src.height, canvas.w, canvas.h, transform),
  }
}
