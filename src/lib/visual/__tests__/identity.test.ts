import { describe, it, expect } from 'vitest'
import { safeParseVisualIdentity } from '../identity-schema'
import { buildDefaultIdentity, DEFAULT_PALETTE } from '../identity'

describe('safeParseVisualIdentity', () => {
  it('accepts a palette-only identity', () => {
    expect(safeParseVisualIdentity(buildDefaultIdentity()).success).toBe(true)
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
  it('returns the neutral default palette', () => {
    expect(buildDefaultIdentity()).toEqual({ palette: DEFAULT_PALETTE })
  })
})
