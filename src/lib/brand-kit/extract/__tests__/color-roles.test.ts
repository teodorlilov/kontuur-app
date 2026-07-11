import { describe, expect, it } from 'vitest'
import { deriveColorRoles } from '../color-roles'
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
})
