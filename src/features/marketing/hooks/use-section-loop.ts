'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useInView } from './use-in-view'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'

interface UseSectionLoopOptions {
  /**
   * How long each phase holds, in milliseconds — one entry per phase. Declare it
   * at module scope: a fresh array every render would restart the loop on every
   * render.
   */
  holds: readonly number[]
  threshold?: number
  /**
   * Fired each time the loop wraps back to phase 0. The engine demo uses it to
   * move on to the next client — a callback rather than derived state, so
   * nothing has to write state from inside an effect body to notice.
   */
  onCycle?: () => void
}

/**
 * The phase machine behind every demo on the landing page.
 *
 * Cycles `0 → holds.length - 1 → 0` while the section is on screen and stops
 * dead when it leaves. The last phase is by convention each demo's settled
 * state — the composed week, the finished caption, the published rows — which
 * is what reduced motion parks on, so nothing is ever left half-played.
 */
export function useSectionLoop<T extends Element>({
  holds,
  threshold = 0.35,
  onCycle,
}: UseSectionLoopOptions) {
  const { ref, inView } = useInView<T>({ threshold })
  const prefersReducedMotion = usePrefersReducedMotion()
  const [runId, setRunId] = useState(0)

  // Held in a ref so a caller passing an inline arrow does not restart the loop
  // on every render of the section around it. Synced from an effect rather than
  // written during render, which React does not allow for refs.
  const onCycleRef = useRef(onCycle)
  useEffect(() => {
    onCycleRef.current = onCycle
  }, [onCycle])

  // Leaving the viewport and replaying both mean "start over", so both are part
  // of the run key. Resetting during render rather than from the effect is the
  // documented way to drop state a prop change invalidated — and it keeps the
  // effect down to scheduling, which is all an effect should be doing.
  const run = `${inView}:${runId}`
  const [state, setState] = useState({ run, phase: 0 })
  if (state.run !== run) setState({ run, phase: 0 })

  useEffect(() => {
    if (prefersReducedMotion || !inView) return

    let current = 0
    let timer: ReturnType<typeof setTimeout>

    const advance = () => {
      current = (current + 1) % holds.length
      setState({ run, phase: current })
      if (current === 0) onCycleRef.current?.()
      timer = setTimeout(advance, holds[current]!)
    }

    timer = setTimeout(advance, holds[0]!)
    return () => clearTimeout(timer)
  }, [run, inView, prefersReducedMotion, holds])

  /** Restart from phase 0 — the "Run it again" control on the engine demo. */
  const replay = useCallback(() => setRunId((n) => n + 1), [])

  return {
    ref,
    phase: prefersReducedMotion ? holds.length - 1 : state.phase,
    replay,
  }
}
