import type { ExtractionResult, VisualIdentity } from '@/types/visual'
import { captureSite } from '@/lib/visual/capture/capture-site'
import { buildDefaultIdentity } from './identity'
import { deriveColorRoles } from './extract/color-roles'

function fallbackResult(reason: string): ExtractionResult {
  return {
    identity: buildDefaultIdentity(),
    report: { source: 'fallback', confidence: {}, fallback: { reason } },
  }
}

export type ExtractIdentityInput = { url: string }

/**
 * Extract a client's visual identity: capture + measure the site's computed styles and derive the brand
 * colour palette. Falls back to the neutral default palette when a site can't be captured. Always resolves
 * to a valid identity — onboarding never blocks or errors.
 */
export async function extractIdentity({ url }: ExtractIdentityInput): Promise<ExtractionResult> {
  const capture = await captureSite(url)
  if (!capture.ok || !capture.measured) {
    return fallbackResult(capture.reason ?? 'no website capture')
  }

  const identity: VisualIdentity = { palette: deriveColorRoles(capture.measured.colors) }
  const report: ExtractionResult['report'] = {
    source: 'website',
    confidence: { colors: 'measured', accent: 'measured' },
  }
  return { identity, report }
}
