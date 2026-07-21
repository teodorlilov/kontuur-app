import type { Typography, VibePresetId, VisualIdentity } from '@/types/visual'
import { getVibePreset } from './vibe-presets'
import { getFont } from './fonts'

/** The resolved typography pairing for a preset (family names — the authoritative Phase-1 typography). */
export function presetTypography(presetId: VibePresetId): Typography {
  const preset = getVibePreset(presetId)
  return {
    display_family: getFont(preset.fontPairing.display).family,
    body_family: getFont(preset.fontPairing.body).family,
  }
}

/** A valid identity built entirely from a preset's defaults — the neutral starting point / fallback. */
export function buildDefaultIdentity(presetId: VibePresetId): VisualIdentity {
  const preset = getVibePreset(presetId)
  return {
    palette: preset.defaultPalette,
    typography: presetTypography(presetId),
    vibe_preset: presetId,
  }
}
