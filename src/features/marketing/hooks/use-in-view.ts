'use client'

import { useEffect, useRef, useState } from 'react'

interface UseInViewOptions {
  /** Fraction of the element that must be showing before it counts. */
  threshold?: number
  rootMargin?: string
  /** Stop observing after the first intersection. Reveals want this; loops must not. */
  once?: boolean
}

/**
 * Reports whether the returned ref's element is on screen.
 *
 * The `once: false` form is what keeps this page cheap. Eight sections run
 * demo loops, and a loop that scrolls away has to stop scheduling — otherwise
 * one pass down the page leaves every timer on the landing running at once.
 */
export function useInView<T extends Element>({
  threshold = 0.15,
  rootMargin = '0px 0px -40px 0px',
  once = false,
}: UseInViewOptions = {}) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setInView(entry.isIntersecting)
        if (entry.isIntersecting && once) observer.disconnect()
      },
      { threshold, rootMargin }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, inView }
}
