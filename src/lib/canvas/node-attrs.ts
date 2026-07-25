import type {
  CanvasBackgroundTransform,
  CanvasElement,
  CanvasScrim,
  CanvasTextAlign,
  CanvasTextLayer,
} from '@/types/canvas'
import { coverCrop, type CropAttrs } from './cover-crop'

/** The lower share of the canvas the 'bottom' scrim band covers. */
const BOTTOM_BAND_RATIO = 0.5

export interface TextGroupAttrs {
  x: number
  y: number
  /** Degrees around the group's top-left origin (Konva default pivot). */
  rotation: number
}

/**
 * Position attrs for the group wrapping one text layer (highlight bands + glyphs move as one
 * node); the text child itself sits at the group origin with only the glyph attrs below.
 */
export function textGroupAttrs(layer: CanvasTextLayer): TextGroupAttrs {
  return { x: layer.x, y: layer.y, rotation: layer.rotation ?? 0 }
}

export interface TextNodeAttrs {
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
}

// Konva folds this straight into ctx.font, so 'italic', 'italic bold' and 'italic 500' all work.
function fontStyleFor(layer: CanvasTextLayer): string {
  const weight = layer.fontWeight === 400 ? '' : layer.fontWeight === 700 ? 'bold' : String(layer.fontWeight)
  if (!layer.italic) return weight || 'normal'
  return weight ? `italic ${weight}` : 'italic'
}

/** Glyph attrs for one text layer (position lives on the group) — editor stage + exporter. */
export function textNodeAttrs(layer: CanvasTextLayer): TextNodeAttrs {
  return {
    width: layer.width,
    // Konva has no textTransform — capitals are applied to the drawn string, not the stored one.
    text: layer.uppercase ? layer.text.toUpperCase() : layer.text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: fontStyleFor(layer),
    fill: layer.fill,
    align: layer.align,
    lineHeight: layer.lineHeight,
    wrap: 'word',
  }
}

export interface ElementNodeAttrs {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
}

/** Konva attrs for one element — shared by the editor stage JSX and the offscreen exporter. */
export function elementNodeAttrs(element: CanvasElement): ElementNodeAttrs {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation ?? 0,
    opacity: element.opacity ?? 1,
  }
}

export interface ScrimNodeAttrs {
  x: number
  y: number
  width: number
  height: number
  fill: string
  opacity: number
}

/** Konva attrs for the scrim rect; null when the scrim is disabled. */
export function scrimNodeAttrs(scrim: CanvasScrim, canvas: { w: number; h: number }): ScrimNodeAttrs | null {
  if (!scrim.enabled) return null
  const bandHeight = scrim.mode === 'full' ? canvas.h : canvas.h * BOTTOM_BAND_RATIO
  return {
    x: 0,
    y: canvas.h - bandHeight,
    width: canvas.w,
    height: bandHeight,
    fill: scrim.color,
    opacity: scrim.opacity,
  }
}

export interface BackgroundNodeAttrs extends CropAttrs {
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
