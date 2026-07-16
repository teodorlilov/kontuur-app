import type { BrandTokens } from '@/lib/scene-graph'
import { ensureLegibleColors } from '@/lib/brand-kit/extract/color-roles'
import { getStyle } from './styles'

/**
 * The one render-token adapter every surface funnels through. The old archetype/showcase machinery is gone —
 * design variety comes from the model now, and the design-system preview + style picker render
 * `sampleCompositions` (renderer/compose.ts) instead. This file only widens the kit's type weights to cover
 * what the chosen style asks for and guarantees legible colours.
 */

const mergeWeights = (a: number[], b: number[]): number[] => [...new Set([...a, ...b])].sort((x, y) => x - y)

/**
 * The kit tokens a style renders with: same families, the weight arrays widened to cover the weights this
 * style needs (so `kitFontsHref` loads them and no weight falls back to a synthesized face), and the colours
 * passed through `ensureLegibleColors` so a low-contrast extraction never renders invisible text. The choke
 * point every render surface funnels through, so the fix reaches stored kits without a re-extraction.
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
