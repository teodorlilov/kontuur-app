import type { BrandTokens } from './types'

/**
 * The neutral default kit. Phase 0's only token source (`brand_kits` arrives in Phase 1),
 * and the kit assigned to any client with no extraction. Achromatic surface/ink, one accent.
 * Hex lives here by design — a token set IS the single source of colour; compositions never hold hex.
 */
export const DEFAULT_TOKENS: BrandTokens = {
  color: {
    surface: '#FFFFFF',
    ink: '#1A1A1A',
    accent: '#2563EB',
    'accent-deep': '#1E3A8A',
    line: '#E5E5E5',
  },
  type: {
    display: { family: 'Inter', weights: [600, 700], tracking: -0.01, case: 'none', lineHeight: 1.1 },
    body: { family: 'Inter', weights: [400, 500], tracking: 0, lineHeight: 1.5 },
    scale: 1.25,
    baseSize: 32,
  },
  space: { steps: [4, 8, 12, 16, 24, 32, 48, 64, 96], radius: 8, hairline: 1 },
  grid: { marginX: 96, marginY: 96, baseline: 8 },
}
