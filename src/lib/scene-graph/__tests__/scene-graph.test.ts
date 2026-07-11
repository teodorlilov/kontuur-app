import { describe, expect, it } from 'vitest'
import { resolve } from '../binding'
import { DEFAULT_TOKENS } from '../default-tokens'
import type { Composition, TextLayer } from '../types'
import { missingColorRoles, validateShareableComposition } from '../validate'

function headline(family: TextLayer['family']): TextLayer {
  return {
    id: 't1',
    name: 'Headline',
    locked: false,
    hidden: false,
    rect: { x: 0, y: 0, w: 1080, h: 200, rotate: 0 },
    opacity: { mode: 'literal', value: 1 },
    blendMode: { mode: 'literal', value: 'normal' },
    clip: { kind: 'none' },
    type: 'text',
    slot: 'headline',
    content: 'Слънцето не чака',
    lang: 'bg',
    family,
    size: { mode: 'bound', token: 'type.baseSize' },
    weight: { mode: 'literal', value: 700 },
    color: { mode: 'bound', token: 'color.ink' },
    align: { mode: 'literal', value: 'left' },
    autoFit: { min: 24, max: 64 },
  }
}

function composition(layers: Composition['layers']): Composition {
  return { id: 'c1', feedSystemId: 'fs1', brandKitVersion: 1, size: { w: 1080, h: 1350 }, layers }
}

describe('resolve', () => {
  it('returns a bound token value by dot-path', () => {
    expect(resolve<string>({ mode: 'bound', token: 'color.accent' }, DEFAULT_TOKENS)).toBe('#2563EB')
    expect(resolve<string>({ mode: 'bound', token: 'type.display.family' }, DEFAULT_TOKENS)).toBe('Source Serif 4')
  })

  it('returns a literal value unchanged', () => {
    expect(resolve<number>({ mode: 'literal', value: 0.5 }, DEFAULT_TOKENS)).toBe(0.5)
  })

  it('throws on an unknown token path', () => {
    expect(() => resolve({ mode: 'bound', token: 'color.nope' }, DEFAULT_TOKENS)).toThrow(
      /Unknown token path/
    )
  })
})

describe('validateShareableComposition', () => {
  it('passes a clean template — bound family, no hex', () => {
    const clean = composition([headline({ mode: 'bound', token: 'type.display.family' })])
    expect(validateShareableComposition(clean)).toEqual([])
  })

  it('rejects a literal font family', () => {
    const issues = validateShareableComposition(composition([headline({ mode: 'literal', value: 'Comic Sans' })]))
    expect(issues.some((issue) => issue.message.includes('font family'))).toBe(true)
  })

  it('rejects a hex literal anywhere in the layers', () => {
    const layer = headline({ mode: 'bound', token: 'type.display.family' })
    layer.color = { mode: 'literal', value: '#ff0000' }
    const issues = validateShareableComposition(composition([layer]))
    expect(issues.some((issue) => issue.message.includes('hex literal'))).toBe(true)
  })
})

describe('DEFAULT_TOKENS', () => {
  it('has all five colour roles', () => {
    expect(missingColorRoles(DEFAULT_TOKENS)).toEqual([])
  })
})
