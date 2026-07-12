'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BrandTokens, Composition as CompositionType } from '@/lib/scene-graph'
import { renderCompositionToDataURL } from '@/lib/renderer/konva'
import { RATIO_SIZES, resolveComposition, type AspectRatio } from '@/lib/renderer/layout/anchor'
import { REFERENCE_MARKS } from '@/lib/renderer/reference-compositions'

/**
 * One composition rasterised to a static image via the Konva renderer — the same node tree the export
 * uses, so a preview matches a rendered slide exactly. Resolves the composition to the chosen aspect
 * ratio first (anchored layout), then re-rasters (debounced) when tokens/ratio change. Fonts are
 * assumed loaded by an ancestor (PreviewGrid / the tab injects the `<link>`).
 */
export function PreviewCell({
  composition,
  tokens,
  width,
  ratio = '4:5',
}: {
  composition: CompositionType
  tokens: BrandTokens
  width: number
  ratio?: AspectRatio
  /** Retained for API parity; canvas has no per-run language (Bulgarian forms come from the baked fonts). */
  lang?: string
}) {
  const resolved = useMemo(() => resolveComposition(composition, RATIO_SIZES[ratio]), [composition, ratio])
  const height = width * (resolved.size.h / resolved.size.w)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void renderCompositionToDataURL(resolved, tokens, { marks: REFERENCE_MARKS, targetWidth: width }).then((url) => {
        if (!cancelled && url) setSrc(url)
      })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [resolved, tokens, width])

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
