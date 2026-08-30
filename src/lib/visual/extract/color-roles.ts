import type { Palette } from '@/types/visual'
import { DEFAULT_PALETTE } from '../identity'
import {
  chroma,
  contrastRatio,
  darken,
  mix,
  parseHex,
  saturation,
  toHex,
  toHsl,
  type Rgb,
} from './color'

/** One observed colour with a weight (painted area proportion or occurrence count). */
export type ColorSample = { hex: string; weight: number }

/**
 * Colours grouped by where they were measured on the page. The Chromium pass fills these from
 * `getComputedStyle`.
 */
export type ColorObservations = {
  backgrounds: ColorSample[]
  texts: ColorSample[]
  borders?: ColorSample[]
  accents?: ColorSample[] // button backgrounds, link colours
}

type Weighted = { rgb: Rgb; weight: number }

function parse(samples: ColorSample[]): Weighted[] {
  const out: Weighted[] = []
  for (const s of samples) {
    const rgb = parseHex(s.hex)
    if (rgb) out.push({ rgb, weight: s.weight })
  }
  return out
}

function pick(list: Weighted[], score: (w: Weighted) => number): Rgb | null {
  return (
    list.reduce<Weighted | null>((best, w) => (!best || score(w) > score(best) ? w : best), null)
      ?.rgb ?? null
  )
}

const NEUTRAL_MAX_SATURATION = 0.25

/** Below this a colour carries too little chroma to be anyone's brand accent. */
const MIN_ACCENT_CHROMA = 0.15

/**
 * Painted area worth one accent "vote" — roughly a small button.
 *
 * Exported because `measure.ts` needs the SAME number and cannot import it: its half runs inside
 * `page.evaluate`, in the browser's context, where this module does not exist. It is passed in as an
 * evaluate argument instead. Two literals with a comment saying "keep these equal" is not a
 * mechanism — the two pools are only comparable while the divisor is identical, and nothing would
 * have failed if they drifted.
 */
export const AREA_PER_VOTE = 4000

// WCAG AA for normal text. `ink` carries body/heading copy, so it must clear this against `surface`.
const MIN_TEXT_CONTRAST = 4.5
// Correct a hair past AA so the final hex quantization can't drop the rounded colour back under 4.5.
const CONTRAST_MARGIN = 0.2

// The contrast poles — genuinely black and white, not palette values, so they stay literals.
const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

/**
 * What each role falls back to when the page offered nothing usable — read from `DEFAULT_PALETTE`
 * rather than re-typed.
 *
 * These were three hand-written RGB triples that happened to spell `#FFFFFF`, `#1A1A1A` and
 * `#2563EB`: the default palette, encoded a second time in a form where nobody would recognise it.
 * Editing the default would have moved what a new client sees and left every fallback here on the
 * old colours, with nothing to catch it.
 */
const FALLBACK = {
  surface: parseHex(DEFAULT_PALETTE.surface) ?? WHITE,
  ink: parseHex(DEFAULT_PALETTE.ink) ?? BLACK,
  accent: parseHex(DEFAULT_PALETTE.accent) ?? BLACK,
}
const lighten = (c: Rgb, amount: number): Rgb => mix(c, WHITE, amount)

/** Push `fg` toward whichever pole (black or white) the surface contrasts with better — one of them
 *  always clears the WCAG bar for any surface — in small steps that keep `fg`'s hue as long as possible,
 *  until it clears `min`. Deciding by the better pole (not a fixed luminance pivot) is what makes it
 *  correct for mid-tone surfaces, where the crossover sits near luminance 0.18, not 0.5. */
function ensureContrast(fg: Rgb, bg: Rgb, min: number): Rgb {
  const towardWhite = contrastRatio(WHITE, bg) > contrastRatio(BLACK, bg)
  let c = fg
  for (let i = 0; i < 24 && contrastRatio(c, bg) < min; i++) {
    c = towardWhite ? lighten(c, 0.12) : darken(c, 0.12)
  }
  return c
}

/**
 * How far apart two accents must sit on the colour wheel to count as two brand colours.
 *
 * 25° because below it the two read as one colour in two moods — and a shade of the first is the
 * honest description of that, which is what the fallback already provides.
 */
const MIN_ACCENT_HUE_GAP = 25

/** Shortest distance between two hues, the long way round being no distance at all. */
function hueGap(a: Rgb, b: Rgb): number {
  const diff = Math.abs(toHsl(a).h - toHsl(b).h) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * The best-scoring candidate that is a genuinely different colour from `accent`, or null.
 *
 * Hue distance alone is not enough: at low saturation two hues far apart still look like the same
 * grey, so a candidate must also carry enough chroma for its hue to be visible at all. Without that
 * check a near-neutral link colour 40° away would be promoted to "the second brand colour".
 */
function pickSecondAccent(
  pool: Weighted[],
  accent: Rgb,
  score: (w: Weighted) => number
): Rgb | null {
  const distinct = pool.filter(
    (w) => chroma(w.rgb) >= MIN_ACCENT_CHROMA && hueGap(w.rgb, accent) >= MIN_ACCENT_HUE_GAP
  )
  return pick(distinct, score)
}

/**
 * Guarantee the kit's text is legible: `ink` (body + headings) must clear the WCAG contrast bar against
 * `surface`. `deriveColorRoles` picks the two independently — the dominant background vs the dominant
 * text — so a site with light text on coloured buttons can yield `ink === surface` (white on white).
 * This corrects `ink` in place, keeping its hue where it can, and leaves a well-contrasted kit untouched.
 */
export function ensureLegibleColors(colors: Palette): Palette {
  const surface = parseHex(colors.surface)
  const ink = parseHex(colors.ink)
  if (!surface || !ink || contrastRatio(ink, surface) >= MIN_TEXT_CONTRAST) return colors
  return {
    ...colors,
    ink: toHex(ensureContrast(ink, surface, MIN_TEXT_CONTRAST + CONTRAST_MARGIN)),
  }
}

/**
 * Derive the five colour roles from categorised page measurements — the deterministic pass, and the
 * only one. `surface`/`ink` are the dominant background/text; `accent` is the most saturated
 * call-to-action colour; `accent-deep` is a darker sibling; `line` is the common border, else a
 * low-contrast tint of ink.
 *
 * This used to promise that "Claude vision re-picks the true accent afterwards (badged `inferred`)".
 * No such pass was ever built. The claim outlived its own plan and kept an unread confidence map
 * alive in `ExtractionReport` for a year by making it look like something fed it. What corrects a
 * bad accent is the user, in the palette editor.
 */
export function deriveColorRoles(obs: ColorObservations): Palette {
  const backgrounds = parse(obs.backgrounds)
  const texts = parse(obs.texts)
  const borders = parse(obs.borders ?? [])
  const accents = parse(obs.accents ?? [])

  const surface = pick(backgrounds, (w) => w.weight) ?? FALLBACK.surface
  const ink = pick(texts, (w) => w.weight) ?? FALLBACK.ink

  // The accent is a *chromatic* colour, so prefer chromatic candidates — a grey link or a black
  // button is not an accent. Weight by √frequency so a hue used across many buttons/links beats a
  // single saturated stray, without a high-count neutral swamping a genuinely branded colour.
  //
  // Prefer, not require. The threshold used to be a hard filter, and a tastefully muted brand — sage,
  // taupe, dusty rose — emptied the pool and was handed a hardcoded blue it had never used, which the
  // palette editor then presented as its own. Falling back to the most chromatic thing the site
  // ACTUALLY has is wrong less often than inventing a colour, and it is wrong in a way the user can
  // see and correct.
  // A large field of colour is a brand statement, and often the loudest one a site makes: a blue
  // header band and hero measured 1.4 million px² on one live site whose accent pool held nothing
  // but a theme-default link colour. Restricting candidates to links and buttons meant the brand
  // colour was invisible to us precisely on the sites that commit to it hardest. Area is converted
  // to the same "votes" scale the accent pool uses so neither swamps the other.
  const backgroundVotes = backgrounds.map((w) => ({
    rgb: w.rgb,
    weight: w.weight / AREA_PER_VOTE,
  }))
  const source = accents.length || backgroundVotes.length ? [...accents, ...backgroundVotes] : texts
  const chromatic = source.filter((w) => chroma(w.rgb) >= MIN_ACCENT_CHROMA)
  const accentPool = chromatic.length > 0 ? chromatic : source
  const score = (w: Weighted) => chroma(w.rgb) * Math.sqrt(w.weight)
  const accent = pick(accentPool, score) ?? FALLBACK.accent

  // A REAL second brand colour when the site has one, and only a shade of the first when it does not.
  //
  // This was `darken(accent, 0.35)` unconditionally, which meant no client ever had two brand
  // colours — only one and its own shadow, sharing a hue by construction. It is measurable how often
  // that fired: one live client's stored secondary is byte-for-byte `darken(primary, 0.35)`.
  // Downstream, anything deriving variety from "primary vs secondary" was working with one colour.
  const accentDeep = pickSecondAccent(accentPool, accent, score) ?? darken(accent, 0.35)
  // Dividers must read as a subtle neutral hairline, never a saturated brand colour (a green-bordered
  // site would otherwise make the divider bright green). Prefer the most common *low-saturation* border;
  // otherwise a faint tint of ink on surface.
  const neutralBorders = borders.filter((w) => saturation(w.rgb) <= NEUTRAL_MAX_SATURATION)
  const line = pick(neutralBorders, (w) => w.weight) ?? mix(ink, surface, 0.85)

  return ensureLegibleColors({
    surface: toHex(surface),
    ink: toHex(ink),
    accent: toHex(accent),
    'accent-deep': toHex(accentDeep),
    line: toHex(line),
  })
}
