export type Rgb = { r: number; g: number; b: number }

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Parse `#rgb` / `#rrggbb` (with or without `#`) to RGB, or null if it isn't a plain hex colour. */
export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Parse any CSS colour `getComputedStyle` returns — hex, `rgb(...)`, or `rgba(...)` (commas or the
 *  modern space/slash syntax) — to RGB. Alpha is dropped; returns null if it isn't parseable. */
export function parseCssColor(input: string): Rgb | null {
  const s = input.trim()
  if (s.startsWith('#')) return parseHex(s)
  const match = s.match(/^rgba?\(([^)]+)\)$/i)
  if (!match?.[1]) return null
  const [r, g, b] = match[1].split(/[\s,/]+/).filter(Boolean)
  if (r === undefined || g === undefined || b === undefined) return null
  const rgb = { r: Number(r), g: Number(g), b: Number(b) }
  return Number.isFinite(rgb.r) && Number.isFinite(rgb.g) && Number.isFinite(rgb.b) ? rgb : null
}

/** RGB → uppercase `#rrggbb`. */
export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** RGB → HSL (h in degrees 0–360, s and l in 0–1). The single hue/saturation/lightness source. */
export function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h, s, l }
}

/** HSL saturation (0 = grey, 1 = fully saturated). */
export function saturation(rgb: Rgb): number {
  return toHsl(rgb).s
}

/**
 * How much actual colour is in this, 0–1 — the signal for "is this an accent".
 *
 * Not HSL saturation, which is a ratio and lies at the extremes: a cream (#FFFDED) reports 100%
 * saturation while being, to any eye, white. That is how a near-white was once promoted to a
 * client's second brand colour. Chroma measures the spread between the channels instead, so a pale
 * tint scores low however "saturated" the HSL maths calls it.
 */
export function chroma({ r, g, b }: Rgb): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
}

/**
 * HSL → RGB. The inverse of `toHsl`, and the reason it exists: deriving a tonal ladder means
 * holding a colour's hue and saturation while moving its lightness, which is a round trip.
 */
export function fromHsl({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** The same colour at a different lightness (0–1), keeping its hue and saturation. */
export function atLightness(rgb: Rgb, lightness: number): Rgb {
  const { h, s } = toHsl(rgb)
  return fromHsl({ h, s, l: lightness })
}

/** Linear blend from `a` to `b` (t=0 → a, t=1 → b). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

/** Darken toward black by `amount` (0 = unchanged, 1 = black). */
export function darken(c: Rgb, amount: number): Rgb {
  return mix(c, { r: 0, g: 0, b: 0 }, amount)
}

/** WCAG contrast ratio (1 = identical, 21 = black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
