'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ComposedSlides } from '@/components/posts/composed-slides'
import type { BrandTokens } from '@/lib/scene-graph'
import type { CarouselSlide } from '@/types/api'

type VisualKit = { tokens: BrandTokens; feedSystemSlug: string; clientName: string }

/**
 * The designed slides for a wizard-results post. The copy composes in-browser via `ComposedSlides`; the
 * real fal imagery is generated automatically (this is the manual generation flow, so the spend is
 * intended) and shown under the type. Images are cached by slide-copy hash, so when the post is approved
 * and saved, `composePostVisuals` reuses them — no double spend. "Regenerate" re-runs after copy edits.
 */
export function PostVisualsPreview({ clientId, slides }: { clientId: string; slides: CarouselSlide[] }) {
  const [kit, setKit] = useState<VisualKit | null>(null)
  const [plates, setPlates] = useState<Record<number, string> | null>(null)
  const [generating, setGenerating] = useState(false)
  const firedRef = useRef(false)

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

  const generate = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/preview-visuals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides }),
      })
      const data = (await res.json().catch(() => ({}))) as { plates?: Record<number, string> }
      if (res.ok) setPlates(data.plates ?? {})
    } catch {
      // fail-soft: leave the gradient plates
    } finally {
      setGenerating(false)
    }
  }, [clientId, slides])

  // Auto-generate imagery once, when the kit + slides are ready — so the post displays with photos.
  useEffect(() => {
    if (kit && slides.length > 0 && !firedRef.current) {
      firedRef.current = true
      void generate()
    }
  }, [kit, slides, generate])

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--color-muted)' }}>
          Visuals
        </div>
        <Button size="sm" variant="secondary" loading={generating} onClick={() => void generate()}>
          {generating ? 'Generating…' : plates ? 'Regenerate' : 'Generate visuals'}
        </Button>
      </div>
      <div style={{ position: 'relative' }}>
        <ComposedSlides slides={slides} tokens={kit.tokens} feedSystemSlug={kit.feedSystemSlug} clientName={kit.clientName} plates={plates ?? undefined} />
        {generating && !plates && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              background: 'rgba(244,239,230,0.55)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-muted)',
            }}
          >
            Generating imagery…
          </div>
        )}
      </div>
    </div>
  )
}
