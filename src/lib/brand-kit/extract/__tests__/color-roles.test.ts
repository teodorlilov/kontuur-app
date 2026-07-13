import { describe, expect, it } from 'vitest'
import { deriveColorRoles, ensureLegibleColors } from '../color-roles'
import { contrastRatio, parseHex } from '../color'
import { missingColorRoles } from '@/lib/scene-graph'

describe('deriveColorRoles', () => {
  it('maps a typical light site: white surface, dark ink, saturated accent', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 0.8 }, { hex: '#F5F5F5', weight: 0.2 }],
      texts: [{ hex: '#1A1A1A', weight: 0.7 }, { hex: '#555555', weight: 0.3 }],
      borders: [{ hex: '#E5E5E5', weight: 1 }],
      accents: [{ hex: '#2563EB', weight: 1 }],
    })
    expect(roles.surface).toBe('#FFFFFF')
    expect(roles.ink).toBe('#1A1A1A')
    expect(roles.accent).toBe('#2563EB')
    expect(roles.line).toBe('#E5E5E5')
  })

  it('always fills all five roles even from empty observations', () => {
    const roles = deriveColorRoles({ backgrounds: [], texts: [] })
    expect(missingColorRoles({ color: roles } as never)).toEqual([])
  })

  it('derives accent-deep as a darker sibling of accent', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 1 }],
      texts: [{ hex: '#000000', weight: 1 }],
      accents: [{ hex: '#2563EB', weight: 1 }],
    })
    // accent-deep must be darker than accent (lower on every channel here).
    expect(roles['accent-deep']).not.toBe(roles.accent)
    expect(parseInt(roles['accent-deep'].slice(1, 3), 16)).toBeLessThan(parseInt(roles.accent.slice(1, 3), 16))
  })

  it('falls back to a tint of ink for line when no borders are measured', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 1 }],
      texts: [{ hex: '#000000', weight: 1 }],
    })
    // mix(ink=black, surface=white, 0.85) → light grey, not pure black or white.
    expect(roles.line).not.toBe('#000000')
    expect(roles.line).not.toBe('#FFFFFF')
  })

  it('rescues an invisible ink: light text measured on a light surface still clears contrast', () => {
    // A site with white text on coloured buttons dominating the text samples → ink === surface.
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 1 }],
      texts: [{ hex: '#FFFFFF', weight: 1 }],
      accents: [{ hex: '#5B7BFB', weight: 1 }],
    })
    expect(contrastRatio(parseHex(roles.ink)!, parseHex(roles.surface)!)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('ensureLegibleColors', () => {
  it('darkens ink to clear WCAG contrast when ink === surface (AbSM: white on white)', () => {
    const fixed = ensureLegibleColors({ ink: '#FFFFFF', surface: '#FFFFFF', accent: '#5B7BFB', 'accent-deep': '#3B50A3', line: '#00A0D2' })
    expect(fixed.ink).not.toBe('#FFFFFF')
    expect(contrastRatio(parseHex(fixed.ink)!, parseHex(fixed.surface)!)).toBeGreaterThanOrEqual(4.5)
  })

  it('lightens ink when both are dark (ink on a dark surface)', () => {
    const fixed = ensureLegibleColors({ ink: '#111111', surface: '#000000', accent: '#5B7BFB', 'accent-deep': '#3B50A3', line: '#333333' })
    expect(contrastRatio(parseHex(fixed.ink)!, parseHex(fixed.surface)!)).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves a well-contrasted kit untouched', () => {
    const ok = { ink: '#1A1A1A', surface: '#FFFFFF', accent: '#2563EB', 'accent-deep': '#1E3A8A', line: '#E5E5E5' }
    expect(ensureLegibleColors(ok)).toEqual(ok)
  })
})
