import type { CanvasScrim, CanvasTextAlign, CanvasTextLayer } from '@/types/canvas'
import { coverCrop, type CropAttrs } from './cover-crop'

/** The lower share of the canvas the 'bottom' scrim band covers. */
const BOTTOM_BAND_RATIO = 0.5

export interface TextNodeAttrs {
  x: number
  y: number
  width: number
  text: string
  fontFamily: string
  fontSize: number
  /** Konva expresses weight through fontStyle strings ('normal' | 'bold' | '500' | …). */
  fontStyle: string
  fill: string
  align: CanvasTextAlign
  lineHeight: number
  wrap: 'word'
}

/** Konva attrs for one text layer — shared by the editor stage JSX and the offscreen exporter. */
export function textNodeAttrs(layer: CanvasTextLayer): TextNodeAttrs {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    text: layer.text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: layer.fontWeight === 400 ? 'normal' : layer.fontWeight === 700 ? 'bold' : String(layer.fontWeight),
    fill: layer.fill,
    align: layer.align,
    lineHeight: layer.lineHeight,
    wrap: 'word',
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

/** Konva attrs for the background image: canvas-filling with a centered cover-crop. */
export function backgroundNodeAttrs(
  src: { width: number; height: number },
  canvas: { w: number; h: number }
): BackgroundNodeAttrs {
  return {
    x: 0,
    y: 0,
    width: canvas.w,
    height: canvas.h,
    ...coverCrop(src.width, src.height, canvas.w, canvas.h),
  }
}
