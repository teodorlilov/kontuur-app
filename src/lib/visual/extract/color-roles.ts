import type { Palette } from '@/types/visual'
import { contrastRatio, darken, mix, parseHex, saturation, toHex, type Rgb } from './color'

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
  return list.reduce<Weighted | null>((best, w) => (!best || score(w) > score(best) ? w : best), null)?.rgb ?? null
}

const NEUTRAL_MAX_SATURATION = 0.25

// WCAG AA for normal text. `ink` carries body/heading copy, so it must clear this against `surface`.
const MIN_TEXT_CONTRAST = 4.5
// Correct a hair past AA so the final hex quantization can't drop the rounded colour back under 4.5.
const CONTRAST_MARGIN = 0.2

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }
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
 * Guarantee the kit's text is legible: `ink` (body + headings) must clear the WCAG contrast bar against
 * `surface`. `deriveColorRoles` picks the two independently — the dominant background vs the dominant
 * text — so a site with light text on coloured buttons can yield `ink === surface` (white on white).
 * This corrects `ink` in place, keeping its hue where it can, and leaves a well-contrasted kit untouched.
 */
export function ensureLegibleColors(colors: Palette): Palette {
  const surface = parseHex(colors.surface)
  const ink = parseHex(colors.ink)
  if (!surface || !ink || contrastRatio(ink, surface) >= MIN_TEXT_CONTRAST) return colors
  return { ...colors, ink: toHex(ensureContrast(ink, surface, MIN_TEXT_CONTRAST + CONTRAST_MARGIN)) }
}

/**
 * Derive the five colour roles from categorised page measurements — the deterministic "measured" pass.
 * `surface`/`ink` are the dominant background/text; `accent` is the most saturated call-to-action
 * colour; `accent-deep` is a darker sibling; `line` is the common border, else a low-contrast tint of
 * ink. Claude vision re-picks the true accent afterwards (badged `inferred`).
 */
export function deriveColorRoles(obs: ColorObservations): Palette {
  const backgrounds = parse(obs.backgrounds)
  const texts = parse(obs.texts)
  const borders = parse(obs.borders ?? [])
  const accents = parse(obs.accents ?? [])

  const surface = pick(backgrounds, (w) => w.weight) ?? { r: 255, g: 255, b: 255 }
  const ink = pick(texts, (w) => w.weight) ?? { r: 26, g: 26, b: 26 }

  // The accent is a *chromatic* colour, so drop near-neutral candidates first — a grey link or a
  // black button is not an accent. Weight by √frequency so a hue used across many buttons/links beats a
  // single saturated stray, without a high-count neutral swamping a genuinely branded colour.
  const chromatic = (list: Weighted[]) => list.filter((w) => saturation(w.rgb) > NEUTRAL_MAX_SATURATION)
  const accentPool = chromatic(accents.length ? accents : [...backgrounds, ...texts])
  const accent = pick(accentPool, (w) => saturation(w.rgb) * Math.sqrt(w.weight)) ?? { r: 37, g: 99, b: 235 }

  const accentDeep = darken(accent, 0.35)
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

/**
 * Override the accent with vision's pick (if it's a valid hex) and recompute `accent-deep` from it, so
 * a re-picked accent stays internally consistent. Falls back to the measured accent when vision gives
 * nothing usable.
 */
export function applyVisionAccent(roles: Palette, accentHex: string | null): Palette {
  const base = (accentHex ? parseHex(accentHex) : null) ?? parseHex(roles.accent) ?? { r: 37, g: 99, b: 235 }
  return { ...roles, accent: toHex(base), 'accent-deep': toHex(darken(base, 0.35)) }
}
