import type { Rgb } from '@/lib/brand-kit/extract/color'

/**
 * Photo grades as image filters (increment 2). These are what make a set of AI-generated photos read as
 * ONE brand family instead of random stock — the biggest single jump toward the editorial look. Each is a
 * pure pixel op over an `ImageData` (assignable to `Konva.Filter`), run once on the cached plate in
 * build.ts. Kept Konva-free so the maths is unit-testable without a canvas.
 */
export type ImageFilter = (imageData: ImageData) => void

const luminance = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/**
 * Duotone: remap every pixel's luminance onto a two-colour brand ramp (shadows→`shadow`,
 * highlights→`highlight`), blended back toward the original by `strength` so a little photo character
 * survives. The strongest cohesion tool — any photos become one brand-coloured family.
 */
export function duotoneFilter(shadow: Rgb, highlight: Rgb, strength = 0.85): ImageFilter {
  return function (imageData: ImageData) {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      const l = luminance(d[i]!, d[i + 1]!, d[i + 2]!)
      const r = shadow.r + (highlight.r - shadow.r) * l
      const g = shadow.g + (highlight.g - shadow.g) * l
      const b = shadow.b + (highlight.b - shadow.b) * l
      d[i] = d[i]! + (r - d[i]!) * strength
      d[i + 1] = d[i + 1]! + (g - d[i + 1]!) * strength
      d[i + 2] = d[i + 2]! + (b - d[i + 2]!) * strength
    }
  }
}

/** Tint: desaturate partway toward luminance, then wash toward `color` by `amount`. A subtle on-brand
 *  grade that keeps the photo natural — the "muted editorial photography" look. */
export function tintFilter(color: Rgb, amount: number, desaturate = 0.4): ImageFilter {
  return function (imageData: ImageData) {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      const l = luminance(d[i]!, d[i + 1]!, d[i + 2]!) * 255
      const r = d[i]! + (l - d[i]!) * desaturate
      const g = d[i + 1]! + (l - d[i + 1]!) * desaturate
      const b = d[i + 2]! + (l - d[i + 2]!) * desaturate
      d[i] = r + (color.r - r) * amount
      d[i + 1] = g + (color.g - g) * amount
      d[i + 2] = b + (color.b - b) * amount
    }
  }
}

// Bayer 4×4 ordered-dither thresholds, normalised to 0..1 — the classic halftone matrix.
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16))

/**
 * Halftone: a two-tone ordered-dither print look — each pixel snaps to `shadow` or `highlight` by
 * comparing its luminance to a Bayer threshold, so mid-tones resolve into a dot pattern (the editorial
 * newsprint feel). Two brand colours, so any photo prints on-brand. Deterministic (no randomness), so a
 * preview matches the export exactly.
 */
export function halftoneFilter(shadow: Rgb, highlight: Rgb): ImageFilter {
  return function (imageData: ImageData) {
    const d = imageData.data
    const w = imageData.width || 1
    for (let i = 0; i < d.length; i += 4) {
      const p = i / 4
      const threshold = BAYER_4[Math.floor(p / w) % 4]![p % w % 4]!
      const on = luminance(d[i]!, d[i + 1]!, d[i + 2]!) > threshold
      d[i] = on ? highlight.r : shadow.r
      d[i + 1] = on ? highlight.g : shadow.g
      d[i + 2] = on ? highlight.b : shadow.b
    }
  }
}

/** Grain: monochrome noise for a printed, editorial texture. `amount` is the ± pixel range. */
export function grainFilter(amount: number): ImageFilter {
  return function (imageData: ImageData) {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount
      d[i] = d[i]! + n
      d[i + 1] = d[i + 1]! + n
      d[i + 2] = d[i + 2]! + n
    }
  }
}
