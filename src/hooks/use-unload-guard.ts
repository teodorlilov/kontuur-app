'use client'

import { useEffect } from 'react'

/**
 * Warns before leaving with unsaved work.
 *
 * Attached only while dirty and removed as soon as it is not: a `beforeunload` listener that is
 * always registered disables the back/forward cache for the whole route.
 *
 * Shared by the settings SaveBar and the onboarding draft sheet — both hold work that exists
 * nowhere but the page until it is saved.
 */
export function useUnloadGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return

    function handler(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
