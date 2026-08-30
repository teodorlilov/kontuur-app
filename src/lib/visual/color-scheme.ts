import type { Palette } from '@/types/visual'
import { atLightness, parseHex, relativeLuminance, toHex } from './extract/color'
import { hashIndex } from '@/utils/hash-index'
import { DEFAULT_PALETTE } from './identity'

/**
 * The colour a post is built on — a PAIR, not a single value.
 *
 * A pair rather than one colour because a single rotating colour was measurably not enough. The
 * first attempt rotated the brand hue and a client could not see the difference: at 42% saturation a
 * 24° rotation moves perceived colour by ΔE 10, and even 60° only reaches 24. Dropping the same
 * colour to lightness 20 moves it by ΔE 47. Tone is the lever; hue barely is.
 *
 * Pairing also puts both brand colours to work. The secondary is the ground on some posts and the
 * accent on others, so a client with two colours gets a feed that uses both rather than one colour
 * and its own shadow.
 */
export interface ColorScheme {
  ground: string
  accent: string
}

/** The rungs a scheme picks from, coarse to fine. Names are the vocabulary styles use to choose. */
export type ToneName = 'paper' | 'tint' | 'light' | 'primary' | 'secondary' | 'shade' | 'ink'

export type ToneLadder = Record<ToneName, string>

/** Lightness targets for the derived rungs. The brand's own two colours sit wherever they sit. */
const TINT_L = 0.92
const LIGHT_L = 0.78
const SHADE_L = 0.34
const INK_L = 0.2

/**
 * Build the tonal ladder a client's schemes are drawn from.
 *
 * Every rung is one of the brand's own colours at a different lightness — nothing is invented, which
 * is what lets the settings panel keep promising that colours come from the brand. `paper` is the
 * client's own background when that background is genuinely pale, and white otherwise, because a
 * dark-site brand still needs a light end to its ladder for the styles built on negative space.
 *
 * Derived live at generation time and never stored, so editing the palette reconfigures every future
 * post with no migration, no cache and no second list for the user to maintain.
 */
export function deriveToneLadder(palette: Palette): ToneLadder {
  // The default palette's own accent, read from it rather than re-typed as the RGB triple that
  // happens to spell `#2563EB` — a second, unrecognisable copy of a value that is allowed to change.
  const primary = parseHex(palette.accent) ?? parseHex(DEFAULT_PALETTE.accent)!
  const secondary = parseHex(palette['accent-deep']) ?? primary
  const surface = parseHex(palette.surface)

  // Literal white, not a palette value: this is the light END of the ladder, and a dark-site brand
  // still needs one for the styles built on negative space.
  const paper = surface && relativeLuminance(surface) > 0.75 ? surface : { r: 255, g: 255, b: 255 }

  return {
    paper: toHex(paper),
    tint: toHex(atLightness(primary, TINT_L)),
    light: toHex(atLightness(primary, LIGHT_L)),
    primary: toHex(primary),
    secondary: toHex(secondary),
    shade: toHex(atLightness(secondary, SHADE_L)),
    ink: toHex(atLightness(secondary, INK_L)),
  }
}

/** A scheme named by rung, so a style declares intent rather than hexes. */
export type SchemeSpec = readonly [ground: ToneName, accent: ToneName]

/**
 * Resolve a style's named scheme against a client's ladder — two rung names in, two hexes out.
 *
 * Named `schemeFromSpec` rather than `resolveScheme`, which it was, because `post-color` exports a
 * `resolveScheme` of its own: an async one that reads the post row, derives, claims the pair and
 * returns the winner. Two exported functions with one name in one folder, one of them a pure lookup
 * and the other a database write, is a trap for whoever greps next.
 */
export function schemeFromSpec(ladder: ToneLadder, spec: SchemeSpec): ColorScheme {
  return { ground: ladder[spec[0]], accent: ladder[spec[1]] }
}

/**
 * Identity of a scheme, for asking whether a recent post already wore it.
 *
 * The PAIR, not the ground. Graphic Editorial prints on paper and varies its ink, so two of its
 * schemes can share a ground and still be plainly different posts — comparing grounds alone would
 * have declared them the same and excluded a colour the feed had not actually used. One definition
 * because two callers ask the question: the picker, and the query that reads history back.
 */
export function schemeKey(scheme: ColorScheme): string {
  return `${scheme.ground}/${scheme.accent}`
}

/**
 * How many recent posts a new scheme must differ from, as a FRACTION of what is available.
 *
 * Fixed at three, this starved the pool: a style offering four schemes minus three recent left one
 * candidate, `hashIndex` had nothing to choose between, and every post in a run came back identical
 * — the guard against repetition causing repetition. Half is the most that can be excluded while
 * still leaving a real choice.
 */
const ADJACENCY_FRACTION = 0.5

/**
 * The most recent posts worth comparing against: the Instagram grid is three tiles wide, so a
 * scheme repeating two posts later lands directly above its twin.
 */
const GRID_ROW = 3

/**
 * How many recent posts this style's rotation can actually avoid.
 *
 * The two limits above used to be applied in different files and disagreed in silence. `post-color`
 * fetched three rows "because the grid is three tiles wide" while this module honoured
 * `floor(n × 0.5)` — which is TWO for both four-scheme styles, Graphic Editorial included, and that
 * is the default every client starts on. So the third row was read on every generation and thrown
 * away, and the guarantee the fetch documented was not the one the picker provided.
 *
 * One function, asked by both: the query fetches exactly what the picker will honour.
 *
 * The cap is a real constraint, not a rounding artefact — a style cannot avoid three neighbours out
 * of four schemes without leaving one candidate and making every post in a run identical. Widening
 * it means giving the style more schemes, not raising the fraction.
 */
export function adjacencyWindow(schemeCount: number): number {
  return Math.min(GRID_ROW, Math.floor(schemeCount * ADJACENCY_FRACTION))
}

/**
 * Which scheme this post takes.
 *
 * `base` and `offset` divide one job. `base` places the client somewhere in the rotation; `offset`
 * walks along it. Consecutive offsets from ONE base are guaranteed distinct — that is the whole
 * mechanism, and it only holds while the base is the same for everything being spread.
 *
 * That distinction was got wrong once and it is worth stating plainly, because the wrong version
 * looked right and measured as noise. The draft route passed the per-DRAFT id as the base and the
 * draft's ordinal as the offset — two independent random draws, one of them shifted by a constant,
 * which is still two independent random draws. Measured over 20,000 simulated three-draft runs
 * against the eight-scheme poster style:
 *
 *     per-draft base + offset : 34.1% of runs repeat a scheme
 *     per-draft base, no offset : 34.0%   <- the offset bought nothing
 *     one base per run + offset :  0.0%   <- what it is for
 *
 * So a batch must pass something CONSTANT across the batch as `base` — the client id — and let the
 * offset do the spreading. A single post passes its own id and offset 0, where the base is doing the
 * placing and there is nothing to spread against.
 */
export function pickScheme(input: {
  schemes: readonly SchemeSpec[]
  ladder: ToneLadder
  /** Schemes this client's most recent posts are wearing, newest first. */
  recent: readonly ColorScheme[]
  /**
   * What places this pick in the rotation. A post id for a single post; the CLIENT id for a batch,
   * because consecutive offsets only spread when they share a base.
   */
  base: string
  offset: number
}): ColorScheme | null {
  const { schemes, ladder, recent, base, offset } = input
  if (schemes.length === 0) return null

  const avoid = new Set(recent.slice(0, adjacencyWindow(schemes.length)).map(schemeKey))
  const unused = schemes.filter((spec) => !avoid.has(schemeKey(schemeFromSpec(ladder, spec))))
  const candidates = unused.length > 0 ? unused : schemes

  const spec = candidates[(hashIndex(base, candidates.length) + offset) % candidates.length]
  return spec ? schemeFromSpec(ladder, spec) : null
}
