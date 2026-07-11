export type FitLabel = 'ok' | 'overflow' | `shrunk:${number}`

export type FitOutcome = { size: number; steps: number; fit: FitLabel }

/**
 * Step `startSize` down the type scale until `fits(size)` reports true or `min` is reached, and
 * report the outcome. Pure — the caller supplies `fits`: a real `scrollHeight <= clientHeight`
 * measurement in the renderer, a stub in tests. If it never fits, the outcome is `overflow` (the
 * caller must NOT clip — overflow is surfaced for the copy pipeline to shorten, per §2.4).
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

/** Measure one element at `size` by mutating its font size — the DOM `fits` predicate. */
function fitsAt(el: HTMLElement, size: number): boolean {
  el.style.fontSize = `${size}px`
  return el.scrollHeight <= el.clientHeight
}

/** Shrink one `[data-autofit]` element to fit its fixed box and stamp `data-fit` with the outcome. */
export function fitElement(el: HTMLElement, scale: number): void {
  const startSize = parseFloat(getComputedStyle(el).fontSize)
  if (!Number.isFinite(startSize) || startSize <= 0) return
  const min = Number(el.dataset.fitMin ?? '0')
  const outcome = computeFit((size) => fitsAt(el, size), { startSize, min, scale })
  el.dataset.fit = outcome.fit
}

/**
 * Run autoFit over every `[data-autofit]` text layer under the stage. Called by `<Stage>` after fonts
 * load and before it signals `window.__stageReady`, so the screenshot captures the shrunk text.
 * (Phase 4's editor will re-run this reactively on edit; Phase 0 only needs the one-shot render pass.)
 */
export function runAutoFitPass(root: HTMLElement, scale: number): void {
  root.querySelectorAll<HTMLElement>('[data-autofit]').forEach((el) => fitElement(el, scale))
}
