import type { ColorRole } from '@/lib/scene-graph'
import { darken, mix, parseHex, saturation, toHex, type Rgb } from './color'

/** One observed colour with a weight (painted area proportion or occurrence count). */
export type ColorSample = { hex: string; weight: number }

/**
 * Colours grouped by where they were measured on the page. The Chromium pass (§2.1) fills these from
 * `getComputedStyle`; the image extractor (§2.2) fills `backgrounds`/`accents` from k-means clusters.
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

/**
 * Derive the five colour roles from categorised page measurements — the deterministic "measured" pass.
 * `surface`/`ink` are the dominant background/text; `accent` is the most saturated call-to-action
 * colour; `accent-deep` is a darker sibling; `line` is the common border, else a low-contrast tint of
 * ink. Claude vision re-picks the true accent afterwards (badged `inferred`, §2.1).
 */
export function deriveColorRoles(obs: ColorObservations): Record<ColorRole, string> {
  const backgrounds = parse(obs.backgrounds)
  const texts = parse(obs.texts)
  const borders = parse(obs.borders ?? [])
  const accents = parse(obs.accents ?? [])

  const surface = pick(backgrounds, (w) => w.weight) ?? { r: 255, g: 255, b: 255 }
  const ink = pick(texts, (w) => w.weight) ?? { r: 26, g: 26, b: 26 }

  const accentPool = accents.length
    ? accents
    : [...backgrounds, ...texts].filter((w) => saturation(w.rgb) > NEUTRAL_MAX_SATURATION)
  const accent = pick(accentPool, (w) => saturation(w.rgb) * w.weight) ?? { r: 37, g: 99, b: 235 }

  const accentDeep = darken(accent, 0.35)
  const line = pick(borders, (w) => w.weight) ?? mix(ink, surface, 0.85)

  return {
    surface: toHex(surface),
    ink: toHex(ink),
    accent: toHex(accent),
    'accent-deep': toHex(accentDeep),
    line: toHex(line),
  }
}

/**
 * Override the accent with vision's pick (if it's a valid hex) and recompute `accent-deep` from it, so
 * a re-picked accent stays internally consistent. Falls back to the measured accent when vision gives
 * nothing usable.
 */
export function applyVisionAccent(roles: Record<ColorRole, string>, accentHex: string | null): Record<ColorRole, string> {
  const base = (accentHex ? parseHex(accentHex) : null) ?? parseHex(roles.accent) ?? { r: 37, g: 99, b: 235 }
  return { ...roles, accent: toHex(base), 'accent-deep': toHex(darken(base, 0.35)) }
}
