export type TypeScaleFit = { scale: number; baseSize: number }

// The modular-scale ratios a well-set site is likely using (matches the starter feed systems).
const RATIOS = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618]

/**
 * Fit a modular scale to observed font sizes: the smallest size is the body base, then pick the ratio
 * whose geometric ladder (`base · ratio^k`) best explains the larger sizes. Deterministic; badged
 * `measured` for the website path. Defaults to 1.25 / 16px when there is nothing to fit.
 */
export function fitTypeScale(sizes: number[]): TypeScaleFit {
  const clean = sizes.filter((s) => Number.isFinite(s) && s > 0).sort((a, b) => a - b)
  const baseSize = clean[0] ?? 16
  if (clean.length < 2) return { scale: 1.25, baseSize }

  let best = { scale: 1.25, error: Infinity }
  for (const ratio of RATIOS) {
    let error = 0
    for (const size of clean) {
      const step = Math.max(0, Math.round(Math.log(size / baseSize) / Math.log(ratio)))
      const predicted = baseSize * Math.pow(ratio, step)
      error += Math.abs(size - predicted) / size
    }
    if (error < best.error) best = { scale: ratio, error }
  }
  return { scale: best.scale, baseSize }
}
