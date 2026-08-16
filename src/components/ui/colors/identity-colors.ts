import { CLIENT_COLORS } from '@/utils/constants'
import { hashIndex } from '@/utils/hash-index'

/**
 * Deterministic colour for the two things DESIGN.md § Client Identity lets wear one:
 * **which client** this is, and **which pillar** this is.
 *
 * Both draw on `CLIENT_COLORS` — the identity palette that document sanctions as the one
 * exception to the Botanical Closure Rule. It replaced six saturated stock hues (violet,
 * sky, rose, cyan…) that were painting non-Contour colour onto a green-tinted ground.
 *
 * Two named functions over one private recipe, rather than one function taking a
 * "kind": a pillar is not a client, the two vocabularies read differently at call
 * sites, and nothing about the rendering differs. The recipe below is the *only*
 * place the tint is expressed — `avatar.tsx` had its own copy, and
 * `CLIENT_PILL_TONES` had a third at 12%/72% that quietly disagreed with both.
 *
 * `bg` and `text` are CSS values, not Tailwind classes: `color-mix` cannot be
 * expressed as a utility, and the palette is a token list rather than a fixed
 * set of class pairs.
 */
interface IdentityTone {
  /** `background` value — the hue at 14%. */
  bg: string
  /** `color` value — the hue darkened 78% into ink. */
  text: string
  /** The raw hue, for dots and other non-text marks. */
  hex: string
  /**
   * The hue as a surface at an arbitrary strength, 0–100.
   *
   * DESIGN.md already sanctions raising the tint for a larger mark — "the onboarding
   * identity tile uses 30% on a Wash ground" — and a card-sized ground wants a
   * different weight from a 20px avatar. This exists so that weight is a **number
   * passed to the one recipe** rather than a second `color-mix` written by hand at the
   * call site, which is how the calendar ended up with three disagreeing tints before.
   */
  tint: (percent: number) => string
}

/**
 * The one rendering DESIGN.md sanctions: a tint of the hue with the ink darkened into
 * it. Never a solid fill under white text — Sky, Sage and Living Green fail 4.5:1 that
 * way, which is why this is a function and not a lookup table of class pairs.
 */
function toneFor(name: string): IdentityTone {
  const hex = CLIENT_COLORS[hashIndex(name, CLIENT_COLORS.length)] as string
  // Integer percents, not a 0–1 fraction: `0.12 * 100` is 12.000000000000002, which
  // would reach the stylesheet verbatim.
  const tint = (percent: number) => `color-mix(in srgb, ${hex} ${percent}%, transparent)`
  return {
    hex,
    tint,
    bg: tint(14),
    text: `color-mix(in srgb, ${hex} 78%, var(--ink))`,
  }
}

/**
 * Colour for a client, hashed off their name so it is the same on their avatar, their
 * dashboard dot and their calendar pill, forever.
 *
 * Hashed, never indexed by position in a list: the calendar used to key
 * `CLIENT_PILL_TONES` by a client's index in the currently-visible sorted set, so
 * filtering the grid repainted everyone.
 */
export function getClientTone(name: string): IdentityTone {
  return toneFor(name)
}

/** Colour for a pillar name, stable across every surface it appears on. */
export function getPillarColor(pillar: string): IdentityTone {
  return toneFor(pillar)
}
