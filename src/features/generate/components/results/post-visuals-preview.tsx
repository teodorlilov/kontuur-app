'use client'

import { useEffect, useMemo, useState } from 'react'
import { PreviewCell } from '@/features/clients/components/visual-system/preview-cell'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { composeSlides } from '@/lib/renderer/compose'
import { DEFAULT_RATIO } from '@/lib/renderer/layout/anchor'
import type { BrandTokens } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'

type VisualKit = { tokens: BrandTokens; feedSystemSlug: string; clientName: string }

/**
 * The designed slides for a wizard-results post — rendered *client-side*, because the post isn't saved
 * until approve. Fetches the client's visual kit once, composes the (editable) slide copy in-browser via
 * `composeSlides`, and rasterises each slide with the shared Konva `PreviewCell`. Recomposes as the
 * operator edits the copy. (Photographic imagery is Phase 4 and only appears after approve.)
 */
export function PostVisualsPreview({ clientId, slides }: { clientId: string; slides: CarouselSlide[] }) {
  const [kit, setKit] = useState<VisualKit | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/clients/${clientId}/visual-kit`)
      .then((r) => (r.ok ? (r.json() as Promise<VisualKit>) : null))
      .then((k) => {
        if (!cancelled && k) setKit(k)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId])

  const compositions = useMemo(() => {
    if (!kit || slides.length === 0) return []
    return composeSlides(slides, {
      feedSystemSlug: kit.feedSystemSlug,
      ratio: DEFAULT_RATIO,
      postId: 'preview',
      kicker: kit.clientName,
    })
  }, [kit, slides])

  if (!kit || compositions.length === 0) return null

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '0.5px solid var(--color-border-1)',
        borderRadius: 14,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--color-muted)' }}>
        Visuals
      </div>
      <link rel="stylesheet" href={kitFontsHref(kit.tokens)} />
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {compositions.map((composition, i) => (
          <PreviewCell key={i} composition={composition} tokens={kit.tokens} width={128} />
        ))}
      </div>
    </div>
  )
}
