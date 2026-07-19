import { describe, it, expect } from 'vitest'
import { contrastRatio, parseHex, saturation } from '../color'
import { deriveColorRoles, ensureLegibleColors } from '../color-roles'

describe('deriveColorRoles', () => {
  it('picks the dominant background as surface and the dominant text as ink', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }, { hex: '#F0F0F0', weight: 10 }],
      texts: [{ hex: '#111111', weight: 50 }, { hex: '#888888', weight: 5 }],
    })
    expect(roles.surface).toBe('#FFFFFF')
    expect(roles.ink).toBe('#111111')
  })

  it('picks a saturated call-to-action colour as the accent, ignoring neutrals', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      accents: [{ hex: '#777777', weight: 20 }, { hex: '#2563EB', weight: 8 }],
    })
    expect(roles.accent).toBe('#2563EB')
  })

  it('keeps dividers (line) a subtle neutral, never a saturated brand colour', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      borders: [{ hex: '#0BDA51', weight: 30 }], // a saturated green border must NOT become the divider
    })
    expect(saturation(parseHex(roles.line)!)).toBeLessThanOrEqual(0.25)
  })

  it('guarantees legible ink against surface (WCAG AA)', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#F2F2F2', weight: 100 }], // near-white text on white — must be corrected
    })
    const surface = parseHex(roles.surface)!
    const ink = parseHex(roles.ink)!
    expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('ensureLegibleColors', () => {
  it('leaves a well-contrasted palette untouched', () => {
    const palette = { surface: '#FFFFFF', ink: '#1A1A1A', accent: '#2563EB', 'accent-deep': '#1E3A8A', line: '#E5E5E5' }
    expect(ensureLegibleColors(palette)).toEqual(palette)
  })

  it('corrects ink that fails contrast against a mid-tone surface', () => {
    const fixed = ensureLegibleColors({
      surface: '#7A7A7A',
      ink: '#8A8A8A',
      accent: '#2563EB',
      'accent-deep': '#1E3A8A',
      line: '#E5E5E5',
    })
    const surface = parseHex(fixed.surface)!
    const ink = parseHex(fixed.ink)!
    expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5)
  })
})
