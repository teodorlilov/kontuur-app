import { describe, expect, it } from 'vitest'
import { paletteToRoles } from '../image-palette'
import { missingColorRoles } from '@/lib/scene-graph'

describe('paletteToRoles', () => {
  it('assigns surface/ink/accent by luminance and saturation', () => {
    const roles = paletteToRoles([
      { centroid: { r: 250, g: 250, b: 248 }, weight: 60 }, // light, dominant → surface
      { centroid: { r: 18, g: 18, b: 20 }, weight: 25 }, // dark → ink
      { centroid: { r: 210, g: 60, b: 40 }, weight: 15 }, // saturated → accent
    ])
    expect(roles.surface).toBe('#FAFAF8')
    expect(roles.ink).toBe('#121214')
    expect(roles.accent).toBe('#D23C28')
  })

  it('keeps surface, ink, and accent distinct when clusters allow', () => {
    const roles = paletteToRoles([
      { centroid: { r: 255, g: 255, b: 255 }, weight: 50 },
      { centroid: { r: 0, g: 0, b: 0 }, weight: 30 },
      { centroid: { r: 0, g: 120, b: 255 }, weight: 20 },
    ])
    expect(new Set([roles.surface, roles.ink, roles.accent]).size).toBe(3)
  })

  it('always fills all five roles, even from an empty palette', () => {
    expect(missingColorRoles({ color: paletteToRoles([]) } as never)).toEqual([])
  })
})
