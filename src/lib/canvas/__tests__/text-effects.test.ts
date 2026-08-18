import { describe, expect, it } from 'vitest'
import type { CanvasTextNode } from '@/types/canvas'
import {
  TEXT_EFFECT_EXCLUSIVE_FIELDS,
  TEXT_EFFECT_FIELDS,
  TEXT_EFFECT_PRESETS,
  activeTextEffect,
  applyTextEffect,
  maxStrokeWidth,
} from '../text-effects'

function text(over: Partial<CanvasTextNode> = {}): CanvasTextNode {
  return {
    id: 't1',
    kind: 'text',
    role: 'headline',
    x: 80,
    y: 200,
    width: 900,
    text: 'Headline',
    fontFamily: 'Inter',
    fontSize: 64,
    fontWeight: 700,
    fill: '#111111',
    align: 'left',
    lineHeight: 1.1,
    ...over,
  }
}

describe('applyTextEffect', () => {
  it('writes every field it owns, so switching presets leaves nothing behind', () => {
    // The whole point of a preset list: going Outline → Shadow must not keep the outline.
    const outlined = { ...text(), ...applyTextEffect(text(), 'outline') }
    expect(outlined.stroke).toBeDefined()

    const shadowed = { ...outlined, ...applyTextEffect(outlined, 'shadow') }
    expect(shadowed.stroke).toBeUndefined()
    expect(shadowed.strokeWidth).toBeUndefined()
    expect(shadowed.shadowColor).toBeDefined()
  })

  it('every preset patch mentions every field this layer owns outright', () => {
    // A preset that merely omits one would inherit it from whatever came before. `letterSpacing` is
    // excluded on purpose — the lockup layer claims it too, so only `none` may clear it.
    for (const preset of TEXT_EFFECT_PRESETS) {
      const patch = preset.fields(text())
      for (const field of TEXT_EFFECT_EXCLUSIVE_FIELDS) {
        expect(Object.hasOwn(patch, field), `${preset.id} is missing ${field}`).toBe(true)
      }
    }
  })

  it("leaves a lockup's tracking alone unless the user presses None", () => {
    // Pressing Shadow says nothing about tracking. It used to wipe it, which also stopped the slide
    // reporting as wearing the lockup that set it.
    const tracked = text({ letterSpacing: 9 })
    for (const id of ['shadow', 'lift', 'outline'] as const) {
      const after = { ...tracked, ...applyTextEffect(tracked, id) }
      expect(after.letterSpacing, id).toBe(9)
    }
    expect({ ...tracked, ...applyTextEffect(tracked, 'none') }.letterSpacing).toBeUndefined()
  })

  it('still reports the applied effect on a node the lockup layer has tracked', () => {
    const tracked = text({ letterSpacing: 9 })
    const shadowed = { ...tracked, ...applyTextEffect(tracked, 'shadow') }
    expect(activeTextEffect(shadowed)).toBe('shadow')
  })

  it('"none" clears everything', () => {
    const busy = text({
      letterSpacing: 12,
      shadowColor: '#000000',
      stroke: '#ffffff',
      strokeWidth: 3,
    })
    const cleared = { ...busy, ...applyTextEffect(busy, 'none') }
    for (const field of TEXT_EFFECT_FIELDS) expect(cleared[field]).toBeUndefined()
  })

  it('scales with the font size, so a preset reads the same at any size', () => {
    const big = applyTextEffect(text({ fontSize: 96 }), 'shadow')
    const small = applyTextEffect(text({ fontSize: 24 }), 'shadow')
    expect(big.shadowBlur!).toBeGreaterThan(small.shadowBlur!)
    // Opacity is a look, not a measurement — it must NOT scale.
    expect(big.shadowOpacity).toBe(small.shadowOpacity)
  })

  it('gives the outline a colour that CONTRASTS with the text', () => {
    // An outline in the text's own colour is not an outline — it just fattens the letterform. This
    // is the assertion that would have failed the first version of this preset.
    expect(applyTextEffect(text({ fill: '#111111' }), 'outline').stroke).toBe('#FFFFFF')
    expect(applyTextEffect(text({ fill: '#F5F2EA' }), 'outline').stroke).toBe('#000000')
    expect(applyTextEffect(text({ fill: '#2e9e68' }), 'outline').stroke).toBe('#FFFFFF')
  })

  it('keeps the outline under the ceiling that stops glyphs overpainting each other', () => {
    // With tracking on, Konva strokes and fills glyph by glyph, so a later glyph's stroke lands on
    // an earlier glyph's finished fill. The ceiling is what keeps that overlap invisible.
    for (const fontSize of [24, 64, 96, 400]) {
      const patch = applyTextEffect(text({ fontSize }), 'outline')
      expect(patch.strokeWidth!).toBeLessThanOrEqual(maxStrokeWidth(fontSize))
    }
  })
})

describe('activeTextEffect', () => {
  it('recognises a node wearing a preset', () => {
    for (const preset of TEXT_EFFECT_PRESETS) {
      const node = { ...text(), ...applyTextEffect(text(), preset.id) }
      expect(activeTextEffect(node)).toBe(preset.id)
    }
  })

  it('reports null once a knob has been moved off the preset', () => {
    const node = { ...text(), ...applyTextEffect(text(), 'shadow'), shadowBlur: 3 }
    expect(activeTextEffect(node)).toBeNull()
  })

  it('is not knocked off its tile by an unrelated edit', () => {
    // A resize or a colour change must not un-highlight the active preset — those are not effects.
    const node = {
      ...text(),
      ...applyTextEffect(text(), 'spaced'),
      width: 500,
      align: 'center' as const,
    }
    expect(activeTextEffect(node)).toBe('spaced')
  })

  it('calls a plain node "none" rather than null', () => {
    expect(activeTextEffect(text())).toBe('none')
  })
})
