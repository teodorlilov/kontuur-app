'use client'

import { useEffect, useState } from 'react'
import { decodedImage, loadCrossOriginImage } from '../lib/load-image'

interface LoadedImage {
  src: string
  image: HTMLImageElement
}

/**
 * React wrapper around `loadCrossOriginImage`. A stale result for a previous src is filtered by
 * comparison, so no state reset is needed when src changes.
 *
 * An already-decoded src resolves during THIS render rather than after an effect. That is what
 * keeps returning to a slide you have already visited from unmounting the Konva stage: the caller
 * gates the stage on this being non-null, and a one-frame null is a full teardown and rebuild.
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

  if (!src) return null
  return loaded?.src === src ? loaded.image : decodedImage(src)
}
