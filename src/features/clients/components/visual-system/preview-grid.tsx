'use client'

import type { BrandTokens, Composition } from '@/lib/scene-graph'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { feedSystemCompositions, feedSystemTokens, ROLE_ORDER } from '@/lib/renderer/feed-system-compositions'
import type { AspectRatio } from '@/lib/renderer/layout/anchor'
import { PreviewCell } from './preview-cell'

/** Set a composition's plate layer(s) to a generated image — the onboarding design-system preview fills
 *  the plate under the live token layer. Absent url → unchanged (the gradient plate). */
function withPlateSrc(composition: Composition, src: string | undefined): Composition {
  if (!src) return composition
  return { ...composition, layers: composition.layers.map((l) => (l.type === 'plate' ? { ...l, src } : l)) }
}

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
  language,
  plates,
}: {
  tokens: BrandTokens
  feedSystemSlug?: string | null
  ratio?: AspectRatio
  columns?: number
  cellWidth?: number
  /** The client's language — localizes the placeholder demo copy (English for non-Bulgarian). */
  language?: string
  /** Generated design-system plates by role (onboarding). Filled into the plate layer under the live
   *  token type; absent → the gradient plate (unchanged behaviour). */
  plates?: Record<string, string>
}) {
  const rendered = feedSystemTokens(feedSystemSlug, tokens)
  const base = feedSystemCompositions(feedSystemSlug)
  const compositions = plates ? base.map((c, i) => withPlateSrc(c, plates[ROLE_ORDER[i] ?? ''])) : base
  const cells = Array.from({ length: columns * columns }, (_, i) => compositions[i % compositions.length])

  return (
    <>
      <link rel="stylesheet" href={kitFontsHref(rendered)} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`, gap: 8, alignItems: 'start' }}>
        {cells.map((composition, i) =>
          composition ? (
            <PreviewCell key={i} composition={composition} tokens={rendered} width={cellWidth} ratio={ratio} language={language} />
          ) : null
        )}
      </div>
    </>
  )
}
