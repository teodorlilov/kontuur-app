'use client'

import type { BrandTokens, Composition } from '@/lib/scene-graph'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { useKitFonts } from '@/lib/render/use-kit-fonts'
import { feedSystemTokens, styleShowcase } from '@/lib/renderer/feed-system-compositions'
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
 * cells instantly, client-side, with no request. Renders the *selected* style's **archetype showcase**
 * (its actual range of layouts, cycled to fill the grid), so switching styles visibly changes the whole
 * preview and a no-photo/vector style reads correctly. Loads the kit's fonts — at the weights that style
 * needs — once, so the preview matches an exported render.
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
  /** Generated design-system plates keyed by showcase archetype id. Filled into that archetype's plate
   *  layer under the live token type; absent → the gradient plate (unchanged behaviour). */
  plates?: Record<string, string>
}) {
  const rendered = feedSystemTokens(feedSystemSlug, tokens)
  useKitFonts(kitFontsHref(rendered))
  const compositions = styleShowcase(feedSystemSlug).map((a) => withPlateSrc(a.composition, plates?.[a.id]))
  const cells = Array.from({ length: columns * columns }, (_, i) => compositions[i % compositions.length])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`, gap: 8, alignItems: 'start' }}>
      {cells.map((composition, i) =>
        composition ? (
          <PreviewCell key={i} composition={composition} tokens={rendered} width={cellWidth} ratio={ratio} language={language} />
        ) : null
      )}
    </div>
  )
}
