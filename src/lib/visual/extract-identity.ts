import type { ExtractionReport, ExtractionResult, VibePresetId, VisualIdentity } from '@/types/visual'
import { captureSite } from '@/lib/visual/capture/capture-site'
import { buildDefaultIdentity, presetTypography } from './identity'
import { applyVisionAccent, deriveColorRoles } from './extract/color-roles'
import { visionRefine } from './extract/vision'

function fallbackResult(presetId: VibePresetId, reason: string): ExtractionResult {
  return {
    identity: buildDefaultIdentity(presetId),
    report: { source: 'fallback', confidence: { preset: 'inferred' }, fallback: { reason } },
  }
}

export type ExtractIdentityInput = { url: string; fallbackPresetId: VibePresetId }

/**
 * Extract a client's visual identity: tier 1 captures + measures the site and refines it with vision;
 * tier 2 falls back to the (text-recommended) preset's defaults. Always resolves to a valid identity —
 * onboarding never blocks or errors.
 */
export async function extractIdentity({ url, fallbackPresetId }: ExtractIdentityInput): Promise<ExtractionResult> {
  const capture = await captureSite(url)
  if (!capture.ok || !capture.measured || !capture.screenshot) {
    return fallbackResult(fallbackPresetId, capture.reason ?? 'no website capture')
  }

  const measured = deriveColorRoles(capture.measured.colors)
  const vision = await visionRefine({
    base64: capture.screenshot.toString('base64'),
    mediaType: 'image/png',
    accentCandidates: [measured.accent, ...(capture.measured.colors.accents ?? []).map((a) => a.hex)],
  }).catch(() => null)

  if (!vision) return fallbackResult(fallbackPresetId, 'vision refine failed')

  const identity: VisualIdentity = {
    palette: applyVisionAccent(measured, vision.accent),
    typography: presetTypography(vision.vibePreset),
    vibe_preset: vision.vibePreset,
    brief: { mood: vision.mood, photographicSubjects: vision.photographicSubjects, motifs: vision.motifs },
  }
  const report: ExtractionReport = {
    source: 'website',
    confidence: {
      colors: 'measured',
      accent: vision.accent ? 'inferred' : 'measured',
      mood: 'inferred',
      subjects: 'inferred',
      preset: 'inferred',
    },
    presetRecommendation: { id: vision.vibePreset, reason: vision.presetReason },
  }
  return { identity, report }
}
