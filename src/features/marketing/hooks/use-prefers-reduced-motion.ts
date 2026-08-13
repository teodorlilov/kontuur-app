'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

/**
 * True when the visitor has asked their OS to reduce motion.
 *
 * Only the JavaScript-driven loops on this page need to ask. Anything animated
 * in CSS is guarded by its own `prefers-reduced-motion` block in globals.css,
 * which is the better place for it: the settled state stays the stylesheet's
 * default instead of depending on a hook resolving.
 */
export function usePrefersReducedMotion(): boolean {
  // The server cannot know, and guessing "reduce" would ship a static page to
  // everyone. The client snapshot corrects it before any loop is scheduled.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
