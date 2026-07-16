'use client'

import { useMemo } from 'react'
import { PreviewCell } from '@/features/clients/components/visual-system/preview-cell'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { useKitFonts } from '@/lib/render/use-kit-fonts'
import { composePostSlides, withPlateSrc } from '@/lib/renderer/compose'
import type { BrandTokens, Composition } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'

/**
 * Render a carousel's designed slides by composing the copy in-browser against a kit — the shared,
 * data-source-agnostic renderer used wherever a post's slides aren't (yet) stored as `post_visuals`:
 * the generation wizard (pre-save) and the client approval page (read-only, token-based). Surfaces that
 * read stored compositions (review, calendar) use `PostVisuals` instead. Recomposes when copy changes.
 */
export function ComposedSlides({
  slides,
  tokens,
  feedSystemSlug,
  clientName,
  width = 128,
  plates,
  compositions,
}: {
  slides: CarouselSlide[]
  tokens: BrandTokens
  feedSystemSlug: string
  clientName?: string
  width?: number
  /** Generated plate images by slide index (the wizard's on-the-fly imagery). Absent → gradient plates. */
  plates?: Record<number, string>
  /** Pre-composed slides to render as-is (e.g. the wizard editor's edited layout). When given, `slides`/
   *  `plates` are ignored — the caller already resolved the compositions. */
  compositions?: Composition[]
}) {
  const resolved = useMemo(() => {
    if (compositions) return compositions
    if (slides.length === 0) return []
    const composed = composePostSlides(slides, { feedSystemSlug, postId: 'preview', clientName })
    return plates ? composed.map((c, i) => withPlateSrc(c, plates[i])) : composed
  }, [compositions, slides, feedSystemSlug, clientName, plates])

  useKitFonts(kitFontsHref(tokens))

  if (resolved.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {resolved.map((composition, i) => (
        <PreviewCell key={i} composition={composition} tokens={tokens} width={width} />
      ))}
    </div>
  )
}
