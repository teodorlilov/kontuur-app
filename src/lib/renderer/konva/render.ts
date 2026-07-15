import Konva from 'konva'
import type { BrandTokens, Composition } from '@/lib/scene-graph'
import { roleColor } from './colors'
import { buildComposition } from './build'
import { loadCompositionImages } from './images'

export type RasterOptions = {
  marks?: Record<string, string>
  /** Output width in CSS px; the composition is scaled to fit (default: native composition width). */
  targetWidth?: number
  /** Device pixel ratio for crispness (default 2). */
  pixelRatio?: number
  /** Output encoding — default PNG (previews); `image/jpeg` + quality for the smaller publish export. */
  mimeType?: string
  quality?: number
}

/** Ensure the kit's display + body faces are actually loaded — at every weight the compositions use —
 *  before we measure/raster, otherwise canvas text falls back to a system face at unloaded weights (the
 *  Konva equivalent of the DOM `display=block` gate). */
async function ensureFontsReady(tokens: BrandTokens): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const specs = [
    ...tokens.type.display.weights.map((w) => `${w} 48px "${tokens.type.display.family}"`),
    ...tokens.type.body.weights.map((w) => `${w} 48px "${tokens.type.body.family}"`),
  ]
  try {
    await Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => undefined)))
    await document.fonts.ready
  } catch {
    /* a missing face falls back gracefully; never block the raster */
  }
}

/**
 * Rasterise a composition to a PNG data URL via an offscreen Konva stage — the single render path for
 * static previews (and, later, editor export). Colours/fonts resolve to concrete values; the stage is
 * disposed after export so nothing lingers. Returns '' on the server (canvas is client-only).
 */
export async function renderCompositionToDataURL(
  composition: Composition,
  tokens: BrandTokens,
  opts: RasterOptions = {}
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return ''

  await ensureFontsReady(tokens)

  const { w, h } = composition.size
  const scale = (opts.targetWidth ?? w) / w
  const images = await loadCompositionImages(composition, tokens, opts.marks)

  const container = document.createElement('div')
  const stage = new Konva.Stage({ container, width: w * scale, height: h * scale })
  const layer = new Konva.Layer({ listening: false, scaleX: scale, scaleY: scale })
  layer.add(new Konva.Rect({ width: w, height: h, fill: roleColor(tokens, 'surface') })) // stage background = surface
  layer.add(buildComposition(composition, tokens, images))
  stage.add(layer)
  layer.draw()
  try {
    return stage.toDataURL({ pixelRatio: opts.pixelRatio ?? 2, mimeType: opts.mimeType, quality: opts.quality })
  } finally {
    stage.destroy()
  }
}
