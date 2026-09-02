'use client'

import { useEffect, useState } from 'react'
import { ensureFontsReady, injectLibraryStylesheet } from '../lib/fonts'

/**
 * Load the editor font stylesheet and resolve readiness for the given families — the stage must
 * not render text (nor the exporter run) before then. Readiness is derived by key comparison, so
 * a family change flips to not-ready without a synchronous state reset.
 */
export function useEditorFonts(families: string[]): boolean {
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const familiesKey = families.join('|')

  useEffect(() => {
    injectLibraryStylesheet()
    let cancelled = false
    ensureFontsReady(familiesKey.split('|').filter(Boolean))
      .then(() => {
        if (!cancelled) setReadyKey(familiesKey)
      })
      // Swallowed on purpose, and this is not a behaviour change — an unhandled rejection
      // left readyKey unset just the same. A font that fails to load still leaves the stage
      // waiting forever, which is worth revisiting, but not by changing it silently here.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [familiesKey])

  return readyKey === familiesKey
}
