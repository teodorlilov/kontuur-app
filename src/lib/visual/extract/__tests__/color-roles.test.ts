import { describe, it, expect } from 'vitest'
import { contrastRatio, parseHex, saturation } from '../color'
import { deriveColorRoles, ensureLegibleColors } from '../color-roles'

describe('deriveColorRoles', () => {
  it('picks the dominant background as surface and the dominant text as ink', () => {
    const roles = deriveColorRoles({
      backgrounds: [
        { hex: '#FFFFFF', weight: 100 },
        { hex: '#F0F0F0', weight: 10 },
      ],
      texts: [
        { hex: '#111111', weight: 50 },
        { hex: '#888888', weight: 5 },
      ],
    })
    expect(roles.surface).toBe('#FFFFFF')
    expect(roles.ink).toBe('#111111')
  })

  it('picks a saturated call-to-action colour as the accent, ignoring neutrals', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      accents: [
        { hex: '#777777', weight: 20 },
        { hex: '#2563EB', weight: 8 },
      ],
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

  /**
   * `accent-deep` was `darken(accent, 0.35)` unconditionally, so no client ever had two brand
   * colours — only one and its own shadow, sharing a hue by construction. Anything downstream
   * deriving variety from "primary vs secondary" was therefore working with a single colour.
   */
  it('takes a real second brand colour when the site has one', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      accents: [
        { hex: '#2563EB', weight: 400 }, // blue, 217°
        { hex: '#E8590C', weight: 260 }, // orange, 25° — a genuinely different colour
      ],
    })
    expect(roles.accent).toBe('#2563EB')
    expect(roles['accent-deep']).toBe('#E8590C')
  })

  it('falls back to a shade of the accent when the site only has one colour', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      accents: [{ hex: '#A886CD', weight: 300 }],
    })
    expect(roles.accent).toBe('#A886CD')
    expect(roles['accent-deep']).toBe('#6D5785') // darken(#A886CD, 0.35)
  })

  // Two hues close together are one colour in two moods; a shade says that more honestly.
  it('does not promote a near neighbour of the accent to a second colour', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      accents: [
        { hex: '#2563EB', weight: 400 }, // 217°
        { hex: '#256BEB', weight: 380 }, // ~215°, the same blue
      ],
    })
    expect(roles['accent-deep']).toBe('#184099') // darken(#2563EB), not the neighbour
  })

  /**
   * A muted brand used to empty the chromatic pool and be handed a hardcoded #2563EB it had never
   * used — which the palette editor then presented to the client as their own colour.
   */
  it('keeps a muted brand’s own colour instead of inventing a blue', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      accents: [{ hex: '#8A9A8B', weight: 200 }], // sage, saturation well under the threshold
    })
    expect(roles.accent).toBe('#8A9A8B')
    expect(roles.accent).not.toBe('#2563EB')
  })

  it('still invents a default only when there is nothing at all to measure', () => {
    const roles = deriveColorRoles({ backgrounds: [], texts: [] })
    expect(roles.accent).toBe('#2563EB')
  })

  // Twelve footer links used to outvote one hero button twelve to one; weight is area now.
  it('lets one large call-to-action outweigh many small links', () => {
    const roles = deriveColorRoles({
      backgrounds: [{ hex: '#FFFFFF', weight: 100 }],
      texts: [{ hex: '#111111', weight: 50 }],
      accents: [
        { hex: '#C81E5B', weight: 24000 }, // one hero button
        { hex: '#3B82F6', weight: 60 }, // a dozen tiny links
      ],
    })
    expect(roles.accent).toBe('#C81E5B')
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
    const palette = {
      surface: '#FFFFFF',
      ink: '#1A1A1A',
      accent: '#2563EB',
      'accent-deep': '#1E3A8A',
      line: '#E5E5E5',
    }
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
