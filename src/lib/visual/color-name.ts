import { parseHex, toHsl } from './extract/color'

/**
 * Name a colour in plain English, locally.
 *
 * This replaced a Haiku call that named a stored list and cached the answers alongside it. The AI
 * naming was fine; what it cost was the cache — a list of colours, a parallel list of names, an
 * index alignment between them, and a self-heal for when the two drifted. Deriving colours per post
 * made all of that unmaintainable, and none of it bought anything gpt-image-2 could not get from a
 * short phrase plus the hex, which the palette-description fallback has always sent it.
 */

/** Hue bands, in the words a person uses rather than the twelve a colour wheel names. */
const HUES: ReadonlyArray<{ upTo: number; name: string }> = [
  { upTo: 14, name: 'red' },
  { upTo: 40, name: 'orange' },
  { upTo: 65, name: 'amber' },
  { upTo: 80, name: 'yellow' },
  { upTo: 160, name: 'green' },
  { upTo: 195, name: 'teal' },
  { upTo: 250, name: 'blue' },
  { upTo: 285, name: 'violet' },
  { upTo: 320, name: 'purple' },
  { upTo: 345, name: 'magenta' },
  { upTo: 361, name: 'red' },
]

/** A colour with almost no chroma has no hue worth naming — it is a neutral, described by weight. */
const NEUTRAL_MAX_SATURATION = 0.12

function neutralName(lightness: number): string {
  if (lightness > 0.93) return 'white'
  if (lightness > 0.72) return 'light grey'
  if (lightness > 0.4) return 'mid grey'
  if (lightness > 0.15) return 'charcoal'
  return 'near-black'
}

/**
 * `#321F47` → "near-black violet", `#EAE2F3` → "pale violet", `#FFFFFF` → "white".
 *
 * Deliberately coarse. The phrase steers the image model toward a family; the hex that travels
 * beside it in the prompt carries the precision, so inventing finer names would add words without
 * adding information.
 */
export function nameColor(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const { h, s, l } = toHsl(rgb)
  if (s < NEUTRAL_MAX_SATURATION) return neutralName(l)

  const hue = HUES.find((band) => h < band.upTo)?.name ?? 'red'
  if (l > 0.86) return `pale ${hue}`
  if (l > 0.68) return `light ${hue}`
  if (l < 0.22) return `near-black ${hue}`
  if (l < 0.38) return `deep ${hue}`
  return s > 0.6 ? `vivid ${hue}` : `muted ${hue}`
}
