export type FitLabel = 'ok' | 'overflow' | `shrunk:${number}`

export type FitOutcome = { size: number; steps: number; fit: FitLabel }

/**
 * Step `startSize` down the type scale until `fits(size)` reports true or `min` is reached, and
 * report the outcome. Pure and renderer-agnostic — the caller supplies `fits`: a Konva `measureText`
 * height check in the renderer (see `konva/measure-text.ts`), a stub in tests. If it never fits, the
 * outcome is `overflow` (the caller must NOT clip — overflow is surfaced for the copy pipeline to
 * shorten, per §2.4).
 */
export function computeFit(
  fits: (size: number) => boolean,
  opts: { startSize: number; min: number; scale: number }
): FitOutcome {
  const { startSize, min, scale } = opts
  let size = startSize
  let steps = 0
  let ok = fits(size)
  while (!ok && size > min) {
    const next = Math.max(min, size / scale)
    if (next >= size) break
    size = next
    steps += 1
    ok = fits(size)
  }
  const fit: FitLabel = ok ? (steps > 0 ? `shrunk:${steps}` : 'ok') : 'overflow'
  return { size, steps, fit }
}
