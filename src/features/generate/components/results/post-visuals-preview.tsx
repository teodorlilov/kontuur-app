'use client'

import { useEffect, useState } from 'react'
import { ComposedSlides } from '@/components/posts/composed-slides'
import type { BrandTokens } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'

type VisualKit = { tokens: BrandTokens; feedSystemSlug: string; clientName: string }

/**
 * The designed slides for a wizard-results post — rendered client-side, because the post isn't saved
 * until approve. Fetches the client's visual kit once, then composes the (editable) copy in-browser via
 * the shared `ComposedSlides`. (Photographic imagery is Phase 4 and only appears after approve.)
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

  if (!kit || slides.length === 0) return null

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
      <ComposedSlides slides={slides} tokens={kit.tokens} feedSystemSlug={kit.feedSystemSlug} clientName={kit.clientName} />
    </div>
  )
}
