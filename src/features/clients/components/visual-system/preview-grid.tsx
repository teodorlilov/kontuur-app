'use client'

import type { BrandTokens } from '@/lib/scene-graph'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { REFERENCE_COMPOSITIONS } from '@/lib/renderer/reference-compositions'
import { PreviewCell } from './preview-cell'

const REFERENCE = Object.values(REFERENCE_COMPOSITIONS)

/**
 * A live grid of real compositions in the proposed tokens (§2.4/§3.1). Editing a colour re-renders all
 * cells instantly, client-side, with no request. Cycles the five reference compositions to fill the
 * grid. Loads the kit's fonts once so the preview matches an exported render.
 */
export function PreviewGrid({
  tokens,
  columns = 3,
  cellWidth = 150,
  lang = 'bg',
}: {
  tokens: BrandTokens
  columns?: number
  cellWidth?: number
  lang?: string
}) {
  const cells = Array.from({ length: columns * columns }, (_, i) => REFERENCE[i % REFERENCE.length])

  return (
    <>
      <link rel="stylesheet" href={kitFontsHref(tokens)} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`, gap: 8 }}>
        {cells.map((composition, i) =>
          composition ? (
            <PreviewCell key={i} composition={composition} tokens={tokens} width={cellWidth} lang={lang} />
          ) : null
        )}
      </div>
    </>
  )
}
