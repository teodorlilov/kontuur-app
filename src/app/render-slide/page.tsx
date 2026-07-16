'use client'

import { useEffect } from 'react'
import { renderCompositionToDataURL } from '@/lib/renderer/konva'
import type { BrandTokens, Composition } from '@/lib/scene-graph'

/**
 * Internal render surface for the autonomous server-side raster (Phase 6). The headless Chromium already
 * retained for extraction navigates here and calls `window.__render(composition, tokens, fontsHref)` to
 * rasterise a slide with the app's own Konva renderer — so the server render reuses the exact one renderer
 * (no node-canvas, no duplicated draw code). Serves no data of its own (the composition is injected by the
 * caller), so it needs no auth; it's marked public in middleware. Renders nothing visible.
 */
declare global {
  interface Window {
    __renderReady?: boolean
    __render?: (composition: Composition, tokens: BrandTokens, fontsHref?: string) => Promise<string>
  }
}

export default function RenderSlidePage() {
  useEffect(() => {
    window.__render = async (composition, tokens, fontsHref) => {
      if (fontsHref) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = fontsHref
        document.head.appendChild(link)
      }
      return renderCompositionToDataURL(composition, tokens, {
        pixelRatio: 2,
        mimeType: 'image/jpeg',
        quality: 0.92,
      })
    }
    window.__renderReady = true
  }, [])

  return null
}
