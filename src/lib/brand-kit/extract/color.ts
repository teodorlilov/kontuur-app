export type Rgb = { r: number; g: number; b: number }

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Parse `#rgb` / `#rrggbb` (with or without `#`) to RGB, or null if it isn't a plain hex colour. */
export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** RGB → uppercase `#rrggbb`. */
export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0')
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

/** HSL saturation (0 = grey, 1 = fully saturated). The signal for "is this an accent colour". */
export function saturation({ r, g, b }: Rgb): number {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  if (max === min) return 0
  const l = (max + min) / 2
  const d = max - min
  return l > 0.5 ? d / (2 - max - min) : d / (max + min)
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
