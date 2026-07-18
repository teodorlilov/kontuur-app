import { describe, it, expect } from 'vitest'
import { safeParseVisualIdentity } from '../identity-schema'
import { buildDefaultIdentity } from '../identity'
import { getVibePreset, toVibePresetId, DEFAULT_VIBE_PRESET_ID } from '../vibe-presets'

describe('safeParseVisualIdentity', () => {
  it('accepts a valid identity built from a preset', () => {
    const result = safeParseVisualIdentity(buildDefaultIdentity('modern-tech'))
    expect(result.success).toBe(true)
  })

  it('rejects a non-hex palette value with a path:message issue', () => {
    const bad = { ...buildDefaultIdentity('modern-tech'), palette: { ...buildDefaultIdentity('modern-tech').palette, accent: 'blue' } }
    const result = safeParseVisualIdentity(bad)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues.join()).toContain('palette.accent')
  })

  it('rejects an unknown vibe preset', () => {
    const bad = { ...buildDefaultIdentity('modern-tech'), vibe_preset: 'neon-brutalist' }
    expect(safeParseVisualIdentity(bad).success).toBe(false)
  })
})

describe('buildDefaultIdentity', () => {
  it('locks typography to the preset pairing', () => {
    const identity = buildDefaultIdentity('luxury-minimalist')
    const preset = getVibePreset('luxury-minimalist')
    expect(identity.vibe_preset).toBe('luxury-minimalist')
    expect(identity.palette).toEqual(preset.defaultPalette)
    expect(identity.typography.display_family).toBe('Cormorant Garamond')
  })
})

describe('toVibePresetId', () => {
  it('passes through known ids and falls back on unknown', () => {
    expect(toVibePresetId('creative-edgy')).toBe('creative-edgy')
    expect(toVibePresetId('nonsense')).toBe(DEFAULT_VIBE_PRESET_ID)
    expect(toVibePresetId(null)).toBe(DEFAULT_VIBE_PRESET_ID)
  })
})
