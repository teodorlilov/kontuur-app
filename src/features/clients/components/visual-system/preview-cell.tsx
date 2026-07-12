'use client'

import { useEffect, useState } from 'react'
import type { BrandTokens, Composition as CompositionType } from '@/lib/scene-graph'
import { renderCompositionToDataURL } from '@/lib/renderer/konva'
import { REFERENCE_MARKS } from '@/lib/renderer/reference-compositions'

/**
 * One reference composition rasterised to a static image via the Konva renderer — the same node tree
 * the export uses, so a preview matches a rendered slide exactly. Re-rasters (debounced) when the tokens
 * change, so editing a colour recolours the grid without spinning up a live canvas per cell.
 * Fonts are assumed loaded by an ancestor (PreviewGrid / the tab injects the `<link>`).
 */
export function PreviewCell({
  composition,
  tokens,
  width,
}: {
  composition: CompositionType
  tokens: BrandTokens
  width: number
  /** Retained for API parity; canvas has no per-run language (Bulgarian forms come from the baked fonts). */
  lang?: string
}) {
  const { w, h } = composition.size
  const height = width * (h / w)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void renderCompositionToDataURL(composition, tokens, { marks: REFERENCE_MARKS, targetWidth: width }).then((url) => {
        if (!cancelled && url) setSrc(url)
      })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [composition, tokens, width])

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 8,
        overflow: 'hidden',
        border: '0.5px solid var(--color-border-1)',
        background: tokens.color.surface,
        flexShrink: 0,
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- a client-generated data URL, not a remote asset
        <img src={src} alt="" width={width} height={height} style={{ display: 'block', width: '100%', height: '100%' }} />
      )}
    </div>
  )
}
