import Konva from 'konva'
import type { BrandTokens, TextLayer, TextSlot } from '@/lib/scene-graph'
import { resolve } from '@/lib/scene-graph'
import { computeFit } from '../autofit'

const DISPLAY_SLOTS: readonly TextSlot[] = ['kicker', 'headline', 'cta']

/** kicker/headline/cta take the display face + tracking/leading; the rest take the body face. */
function typeRoleForSlot(slot: TextSlot): 'display' | 'body' {
  return DISPLAY_SLOTS.includes(slot) ? 'display' : 'body'
}

/** The content as rendered — display slots uppercase when the kit's display case is 'upper' (parity
 *  with the DOM `text-transform`; canvas has no such property so we transform the string). */
export function textContent(layer: TextLayer, tokens: BrandTokens): string {
  const role = typeRoleForSlot(layer.slot)
  if (role === 'display' && tokens.type.display.case === 'upper') return layer.content.toUpperCase()
  return layer.content
}

export type ResolvedTextStyle = {
  fontFamily: string
  fontStyle: string // numeric weight as a string; Konva folds it into the canvas font shorthand
  fill: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacingEm: number
}

export function textStyle(layer: TextLayer, tokens: BrandTokens): ResolvedTextStyle {
  const typeToken = tokens.type[typeRoleForSlot(layer.slot)]
  return {
    fontFamily: resolve<string>(layer.family, tokens),
    fontStyle: String(resolve<number>(layer.weight, tokens)),
    fill: resolve<string>(layer.color, tokens),
    align: resolve(layer.align, tokens),
    lineHeight: typeToken.lineHeight,
    letterSpacingEm: typeToken.tracking,
  }
}

// One offscreen Konva.Text reused for autofit measurement (created lazily, client-only).
let measurer: Konva.Text | null = null
function getMeasurer(): Konva.Text {
  if (!measurer) measurer = new Konva.Text({ padding: 0, wrap: 'word' })
  return measurer
}

/**
 * The rendered font size for a text layer: its literal size, or — with autoFit — the size stepped down
 * the type scale until the wrapped text height fits the box. Reuses `computeFit` (the same core the DOM
 * pass uses) with a Konva `measureText` predicate so wrapping matches the actual render.
 */
export function fittedFontSize(layer: TextLayer, tokens: BrandTokens): number {
  const startSize = resolve<number>(layer.size, tokens)
  if (!layer.autoFit) return startSize
  const style = textStyle(layer, tokens)
  const content = textContent(layer, tokens)
  const node = getMeasurer()
  const fits = (size: number): boolean => {
    node.setAttrs({
      text: content,
      width: layer.rect.w,
      fontFamily: style.fontFamily,
      fontStyle: style.fontStyle,
      fontSize: size,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacingEm * size,
      align: style.align,
    })
    return node.height() <= layer.rect.h
  }
  return computeFit(fits, { startSize, min: layer.autoFit.min, scale: tokens.type.scale }).size
}
