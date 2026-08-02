import { CLIENT_COLORS } from '@/utils/constants'
import { hashIndex } from '@/utils/hash-index'

/**
 * Deterministic colour mapping for content pillars.
 *
 * Draws on `CLIENT_COLORS` — the identity palette DESIGN.md § Client Identity
 * sanctions as the one exception to the Botanical Closure Rule, for saying
 * *which client* or *which pillar* something is. It replaced six saturated stock
 * hues (violet, sky, rose, cyan…) that were painting non-Contour colour onto a
 * green-tinted ground.
 *
 * Rendering follows `components/ui/avatar.tsx`: a tint of the hue with the ink
 * darkened into it. Never a solid fill under white text — the lighter members of
 * the palette fail 4.5:1 that way.
 *
 * `bg` and `text` are CSS values, not Tailwind classes: `color-mix` cannot be
 * expressed as a utility, and the palette is a token list rather than a fixed
 * set of class pairs.
 */
interface PillarColorSet {
  /** `background` value — the hue at 14%. */
  bg: string
  /** `color` value — the hue darkened 78% into ink. */
  text: string
  /** The raw hue, for dots and other non-text marks. */
  hex: string
}

/** Colour for a pillar name, stable across every surface it appears on. */
export function getPillarColor(pillar: string): PillarColorSet {
  const hex = CLIENT_COLORS[hashIndex(pillar, CLIENT_COLORS.length)] as string
  return {
    hex,
    bg: `color-mix(in srgb, ${hex} 14%, transparent)`,
    text: `color-mix(in srgb, ${hex} 78%, var(--ink))`,
  }
}
