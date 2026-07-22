import { describe, it, expect } from 'vitest'
import { safeParseVisualIdentity } from '../identity-schema'
import { buildDefaultIdentity, DEFAULT_PALETTE } from '../identity'
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
    expect(safeParseVisualIdentity({ palette: DEFAULT_PALETTE, style: 'vaporwave' }).success).toBe(false)
  })

  it('accepts an optional palette description but rejects an empty one', () => {
    expect(
      safeParseVisualIdentity({ palette: DEFAULT_PALETTE, palette_description: 'Cool and clean.' }).success
    ).toBe(true)
    expect(safeParseVisualIdentity({ palette: DEFAULT_PALETTE, palette_description: '' }).success).toBe(false)
  })

  it('rejects a non-hex palette value with a path:message issue', () => {
    const result = safeParseVisualIdentity({ palette: { ...DEFAULT_PALETTE, accent: 'blue' } })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.join()).toContain('palette.accent')
  })

  it('rejects a palette missing a colour role', () => {
    const partial = { surface: '#FFFFFF', ink: '#000000', accent: '#2563EB', 'accent-deep': '#1E3A8A' }
    expect(safeParseVisualIdentity({ palette: partial }).success).toBe(false)
  })
})

describe('buildDefaultIdentity', () => {
  it('returns the neutral default palette with the default style', () => {
    expect(buildDefaultIdentity()).toEqual({ palette: DEFAULT_PALETTE, style: DEFAULT_BRAND_STYLE_ID })
  })
})
