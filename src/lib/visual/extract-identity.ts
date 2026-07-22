import type { ExtractionResult, VisualIdentity } from '@/types/visual'
import { captureSite } from '@/lib/visual/capture/capture-site'
import type { BrandStyleId } from './brand-styles'
import { DEFAULT_BRAND_STYLE_ID } from './brand-styles'
import { buildDefaultIdentity } from './identity'
import { describePalette } from './describe-palette'
import { deriveColorRoles } from './extract/color-roles'

function fallbackResult(reason: string, style: BrandStyleId): ExtractionResult {
  return {
    identity: { ...buildDefaultIdentity(), style },
    report: { source: 'fallback', confidence: {}, fallback: { reason } },
  }
}

export type ExtractIdentityInput = {
  url: string
  /** The client's already-chosen brand style — extraction never overrides a user choice. */
  currentStyle?: BrandStyleId
}

/**
 * Extract a client's visual identity: capture + measure the site's computed styles, derive the brand
 * colour palette, and write its human-readable description (used by image prompts) eagerly. Falls back
 * to the neutral default palette when a site can't be captured. Always resolves to a valid identity —
 * onboarding never blocks or errors.
 */
export async function extractIdentity({ url, currentStyle }: ExtractIdentityInput): Promise<ExtractionResult> {
  const style = currentStyle ?? DEFAULT_BRAND_STYLE_ID
  const capture = await captureSite(url)
  if (!capture.ok || !capture.measured) {
    return fallbackResult(capture.reason ?? 'no website capture', style)
  }

  const palette = deriveColorRoles(capture.measured.colors)
  const identity: VisualIdentity = {
    palette,
    style,
    palette_description: await describePalette(palette),
  }
  const report: ExtractionResult['report'] = {
    source: 'website',
    confidence: { colors: 'measured', accent: 'measured' },
  }
  return { identity, report }
}
