import { describe, it, expect } from 'vitest'
import type { Palette, VisualIdentity } from '@/types/visual'
import { safeParseVisualIdentity } from '../identity-schema'
import { buildDefaultIdentity, DEFAULT_PALETTE, withPalette } from '../identity'
import { DEFAULT_BRAND_STYLE_ID } from '../brand-styles'

describe('safeParseVisualIdentity', () => {
  it('accepts a full identity', () => {
    expect(safeParseVisualIdentity(buildDefaultIdentity()).success).toBe(true)
  })

  it('defaults the style for legacy palette-only blobs', () => {
    const result = safeParseVisualIdentity({ palette: DEFAULT_PALETTE })
    expect(result.success).toBe(true)
    if (result.success) expect(result.identity.style).toBe(DEFAULT_BRAND_STYLE_ID)
  })

  it('rejects an unknown style id', () => {
    expect(safeParseVisualIdentity({ palette: DEFAULT_PALETTE, style: 'vaporwave' }).success).toBe(
      false
    )
  })

  it('accepts an optional palette description but rejects an empty one', () => {
    expect(
      safeParseVisualIdentity({ palette: DEFAULT_PALETTE, palette_description: 'Cool and clean.' })
        .success
    ).toBe(true)
    expect(
      safeParseVisualIdentity({ palette: DEFAULT_PALETTE, palette_description: '' }).success
    ).toBe(false)
  })

  it('rejects a non-hex palette value with a path:message issue', () => {
    const result = safeParseVisualIdentity({ palette: { ...DEFAULT_PALETTE, accent: 'blue' } })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.join()).toContain('palette.accent')
  })

  it('rejects a palette missing a colour role', () => {
    const partial = {
      surface: '#FFFFFF',
      ink: '#000000',
      accent: '#2563EB',
      'accent-deep': '#1E3A8A',
    }
    expect(safeParseVisualIdentity({ palette: partial }).success).toBe(false)
  })
})

describe('buildDefaultIdentity', () => {
  it('returns the neutral default palette with the default style', () => {
    expect(buildDefaultIdentity()).toEqual({
      palette: DEFAULT_PALETTE,
      style: DEFAULT_BRAND_STYLE_ID,
    })
  })
})

describe('withPalette', () => {
  const TAN: Palette = {
    surface: '#FFFFFF',
    ink: '#000000',
    accent: '#CCAE7B',
    'accent-deep': '#C6BEBE',
    line: '#000000',
  }

  /** A measured blue identity, description and all — the shape the extractor writes. */
  const blue: VisualIdentity = {
    palette: DEFAULT_PALETTE,
    style: 'clinical-luxury',
    palette_description: 'Primary accent: periwinkle blue\nDeep accent: deep cobalt blue',
  }

  it('drops the description written for the colours being replaced', () => {
    expect(withPalette(blue, TAN)).not.toHaveProperty('palette_description')
  })

  it('applies the new palette and keeps the chosen style', () => {
    expect(withPalette(blue, TAN)).toEqual({ palette: TAN, style: 'clinical-luxury' })
  })

  it('is a plain swap when no description was stored yet', () => {
    const bare: VisualIdentity = { palette: DEFAULT_PALETTE, style: DEFAULT_BRAND_STYLE_ID }
    expect(withPalette(bare, TAN)).toEqual({
      palette: TAN,
      style: DEFAULT_BRAND_STYLE_ID,
    })
  })

  it('returns a blob the write gate accepts', () => {
    expect(safeParseVisualIdentity(withPalette(blue, TAN)).success).toBe(true)
  })
})
