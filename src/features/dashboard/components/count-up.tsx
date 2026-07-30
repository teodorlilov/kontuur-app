'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const DURATION_MS = 1000

/**
 * Layout effect on the client, plain effect during SSR. A passive effect would
 * fire after the first paint, flashing the final number before counting up.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Counts from zero to `value` on mount. Renders the plain value without motion. */
export function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const frameRef = useRef<number>(0)

  useIsomorphicLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value)
      return
    }

    setDisplay(0)
    let startedAt: number | null = null

    function step(timestamp: number) {
      startedAt ??= timestamp
      const progress = Math.min((timestamp - startedAt) / DURATION_MS, 1)
      // Cubic ease-out, matching the mock's count-up curve.
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value])

  return <>{display.toLocaleString('en-US')}</>
}
