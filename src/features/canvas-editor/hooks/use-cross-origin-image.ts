'use client'

import { useEffect, useState } from 'react'
import { loadCrossOriginImage } from '../lib/load-image'

interface LoadedImage {
  src: string
  image: HTMLImageElement
}

/**
 * React wrapper around `loadCrossOriginImage`. A stale result for a previous src is filtered by
 * comparison, so no state reset is needed when src changes.
 */
export function useCrossOriginImage(src: string | null): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    loadCrossOriginImage(src)
      .then((image) => {
        if (!cancelled) setLoaded({ src, image })
      })
      .catch(() => undefined) // the overlay stays in its loading state; Cancel remains available
    return () => {
      cancelled = true
    }
  }, [src])

  return src && loaded?.src === src ? loaded.image : null
}
