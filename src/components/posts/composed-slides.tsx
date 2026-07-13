'use client'

import { useMemo } from 'react'
import { PreviewCell } from '@/features/clients/components/visual-system/preview-cell'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { useKitFonts } from '@/lib/render/use-kit-fonts'
import { composePostSlides } from '@/lib/renderer/compose'
import type { BrandTokens } from '@/lib/scene-graph'
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
}: {
  slides: CarouselSlide[]
  tokens: BrandTokens
  feedSystemSlug: string
  clientName?: string
  width?: number
}) {
  const compositions = useMemo(() => {
    if (slides.length === 0) return []
    return composePostSlides(slides, { feedSystemSlug, postId: 'preview', clientName })
  }, [slides, feedSystemSlug, clientName])

  useKitFonts(kitFontsHref(tokens))

  if (compositions.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {compositions.map((composition, i) => (
        <PreviewCell key={i} composition={composition} tokens={tokens} width={width} />
      ))}
    </div>
  )
}
