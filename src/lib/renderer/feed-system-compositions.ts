import type { BrandTokens } from '@/lib/scene-graph'
import { ensureLegibleColors } from '@/lib/brand-kit/extract/color-roles'
import { getStyle } from './styles'

const mergeWeights = (a: number[], b: number[]): number[] => [...new Set([...a, ...b])].sort((x, y) => x - y)

/**
 * The kit tokens a style renders with: type-weight arrays widened to what the style needs (so `kitFontsHref`
 * loads them, no synthesized-face fallback) + colours through `ensureLegibleColors` (never invisible text).
 * The choke point every render surface funnels through, so the fix reaches stored kits without re-extraction.
 */
export function feedSystemTokens(slug: string | null | undefined, tokens: BrandTokens): BrandTokens {
  const need = getStyle(slug).weights
  return {
    ...tokens,
    color: ensureLegibleColors(tokens.color),
    type: {
      ...tokens.type,
      display: { ...tokens.type.display, weights: mergeWeights(tokens.type.display.weights, need.display) },
      body: { ...tokens.type.body, weights: mergeWeights(tokens.type.body.weights, need.body) },
    },
  }
}
