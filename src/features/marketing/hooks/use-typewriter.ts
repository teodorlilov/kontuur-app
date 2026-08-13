'use client'

import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'

/**
 * Types `text` out a character at a time once `active`, and clears when it is not.
 *
 * Reduced motion gets the whole string with no intermediate frames — these are
 * real captions and a demo that was skipped must not leave one half-written.
 */
export function useTypewriter(text: string, active: boolean, msPerChar = 18): string {
  const prefersReducedMotion = usePrefersReducedMotion()

  // Reset during render rather than from the effect: a new string or a demo
  // that just went inactive invalidates the count, and adjusting state while
  // rendering is React's own answer to that.
  const run = `${active}:${text}`
  const [progress, setProgress] = useState({ run, count: 0 })
  if (progress.run !== run) setProgress({ run, count: 0 })

  useEffect(() => {
    if (prefersReducedMotion || !active) return

    let count = 0
    const timer = setInterval(() => {
      count += 1
      setProgress({ run, count })
      if (count >= text.length) clearInterval(timer)
    }, msPerChar)

    return () => clearInterval(timer)
  }, [run, active, text.length, msPerChar, prefersReducedMotion])

  if (prefersReducedMotion) return text
  if (!active) return ''
  return text.slice(0, progress.count)
}
