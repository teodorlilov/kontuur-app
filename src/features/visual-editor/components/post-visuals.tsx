'use client'

import { useEffect, useState } from 'react'
import type { CarouselSlide, VisualIdentity } from '@/types'
import { getVibePreset } from '@/lib/visual/vibe-presets'
import { toBackdropRole } from '@/lib/images/text-zones'
import { readNDJSONStream } from '@/utils/stream'
import { SlideCanvas } from './slide-canvas-lazy'

type VisualEvent = { type: 'unit'; index: number; url: string | null } | { type: 'done' } | { type: 'error'; message: string }

/**
 * Composed-slide preview + generation for a persisted post. Fetches the client's visual identity, renders a
 * `SlideCanvas` per unit over its backdrop, and streams `/api/posts/[id]/visuals` — filling each slide as it
 * lands (or on per-slide **Regenerate**). Reusable across review + calendar surfaces.
 */
export function PostVisuals({
  postId,
  clientId,
  slides,
  postType,
  caption,
  readOnly = false,
}: {
  postId: string
  clientId: string
  slides: CarouselSlide[]
  postType: string
  caption: string | null
  /** Read-only display (results view): no generate/regenerate; backdrops come from the `slides` prop. */
  readOnly?: boolean
}) {
  const [identity, setIdentity] = useState<VisualIdentity | null>(null)
  const [backdrops, setBackdrops] = useState<Record<number, string>>(() =>
    Object.fromEntries(slides.map((s, i) => [i, s.backdrop_url]).filter(([, u]) => u) as [number, string][])
  )
  const [busy, setBusy] = useState<'all' | number | null>(null)

  // Sync in backdrops arriving via the `slides` prop (e.g. the wizard's batch stream fills drafts).
  useEffect(() => {
    setBackdrops((prev) => {
      const next = { ...prev }
      slides.forEach((s, i) => {
        if (s.backdrop_url) next[i] = s.backdrop_url
      })
      return next
    })
  }, [slides])

  useEffect(() => {
    let active = true
    fetch(`/api/clients/${clientId}/visual-identity`)
      .then((r) => (r.ok ? r.json() : { identity: null }))
      .then((d: { identity: VisualIdentity | null }) => active && setIdentity(d.identity))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [clientId])

  const isCarousel = postType === 'carousel' && slides.length > 0
  const units = isCarousel
    ? slides.map((s, i) => ({ index: i, role: toBackdropRole(s.slide_role), headline: s.headline, body: s.body }))
    : [{ index: 0, role: 'cover' as const, headline: (caption ?? '').slice(0, 140), body: '' }]

  async function run(unitIndex?: number) {
    if (busy !== null) return
    setBusy(unitIndex ?? 'all')
    try {
      const qs = unitIndex != null ? `?unit=${unitIndex}` : ''
      const res = await fetch(`/api/posts/${postId}/visuals${qs}`, { method: 'POST' })
      if (!res.ok) throw new Error('generation failed')
      await readNDJSONStream<VisualEvent>(res, (e) => {
        if (e.type === 'unit' && e.url) setBackdrops((b) => ({ ...b, [e.index]: e.url! }))
      })
    } catch {
      // fail-soft — slides keep their gradient
    } finally {
      setBusy(null)
    }
  }

  if (!identity) return null
  const preset = getVibePreset(identity.vibe_preset)
  const hasAny = units.some((u) => backdrops[u.index])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 500, color: '#8A8070', letterSpacing: '1.2px', textTransform: 'uppercase' }}>
          Visuals
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy !== null}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: '#fff',
              background: 'var(--color-terracotta, #C07B55)',
              border: 'none',
              borderRadius: 8,
              padding: '7px 13px',
              cursor: busy !== null ? 'default' : 'pointer',
              opacity: busy === 'all' ? 0.7 : 1,
            }}
          >
            {busy === 'all' ? 'Generating…' : hasAny ? 'Regenerate all' : 'Generate visuals'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {units.map((u) => (
          <div key={u.index} style={{ position: 'relative' }}>
            <SlideCanvas
              role={u.role}
              headline={u.headline}
              body={u.body}
              backdropUrl={backdrops[u.index]}
              palette={identity.palette}
              displayFontKey={preset.fontPairing.display}
              bodyFontKey={preset.fontPairing.body}
              width={180}
              slideIndex={u.index}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => void run(u.index)}
                disabled={busy !== null}
                title="Regenerate this slide"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  fontSize: 10,
                  padding: '3px 7px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  cursor: busy !== null ? 'default' : 'pointer',
                  opacity: busy === u.index ? 0.6 : 1,
                }}
              >
                {busy === u.index ? '…' : '↻'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
