'use client'

import type { BrandTokens } from '@/lib/scene-graph'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { feedSystemCompositions, feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import { PreviewCell } from './preview-cell'

/**
 * A live grid of real compositions in the proposed tokens (§2.4/§3.1). Editing a colour re-renders all
 * cells instantly, client-side, with no request. Renders the *selected* feed system's five compositions
 * (cycled to fill the grid), so switching systems visibly changes the whole preview. Loads the kit's
 * fonts — at the weights that system needs — once, so the preview matches an exported render.
 */
export function PreviewGrid({
  tokens,
  feedSystemSlug = null,
  ratio = '4:5',
  columns = 3,
  cellWidth = 150,
  lang = 'bg',
}: {
  tokens: BrandTokens
  feedSystemSlug?: string | null
  ratio?: AspectRatio
  columns?: number
  cellWidth?: number
  lang?: string
}) {
  const rendered = feedSystemTokens(feedSystemSlug, tokens)
  const compositions = feedSystemCompositions(feedSystemSlug)
  const cells = Array.from({ length: columns * columns }, (_, i) => compositions[i % compositions.length])

  return (
    <>
      <link rel="stylesheet" href={kitFontsHref(rendered)} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`, gap: 8, alignItems: 'start' }}>
        {cells.map((composition, i) =>
          composition ? (
            <PreviewCell key={i} composition={composition} tokens={rendered} width={cellWidth} ratio={ratio} lang={lang} />
          ) : null
        )}
      </div>
    </>
  )
}
