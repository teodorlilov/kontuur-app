'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PreviewCell } from '@/features/clients/components/visual-system/preview-cell'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { useKitFonts } from '@/lib/render/use-kit-fonts'
import type { BrandTokens, Composition } from '@/lib/scene-graph'

type VisualsData = {
  status: 'generating' | 'ready' | 'failed' | null
  error: string | null
  slides: { slideIndex: number; composition: Composition }[]
  tokens: BrandTokens
}

const POLL_MS = 1500
const MAX_POLLS = 80 // ~2 min headroom (Phase 4 imagery runs inside the same job)

/**
 * The operator's designed-slides panel in the review flow (Phase 3b). "Generate visuals" kicks the
 * async job, polls for the composed `post_visuals`, and renders each slide with the Konva raster
 * (`PreviewCell`) in the client's tokens. Self-contained — talks only to `/api/posts/[id]/visuals`.
 */
export function PostVisuals({ postId }: { postId: string }) {
  const [data, setData] = useState<VisualsData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<VisualsData | null> => {
    try {
      const res = await fetch(`/api/posts/${postId}/visuals`)
      return res.ok ? ((await res.json()) as VisualsData) : null
    } catch {
      return null
    }
  }, [postId])

  const poll = useCallback(async () => {
    setBusy(true)
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      const d = await load()
      if (d && d.status !== 'generating') {
        setData(d)
        setBusy(false)
        if (d.status === 'failed') setError(d.error ?? 'Generation failed')
        return
      }
    }
    setBusy(false)
    setError('Timed out generating visuals')
  }, [load])

  const generate = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/posts/${postId}/visuals/generate`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to start generation')
      }
      await poll()
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'Failed to generate visuals')
    }
  }, [postId, poll])

  // On mount: load existing visuals; resume polling if a job is still running.
  useEffect(() => {
    let cancelled = false
    void load().then((d) => {
      if (cancelled || !d) return
      setData(d)
      if (d.status === 'generating') void poll()
    })
    return () => {
      cancelled = true
    }
  }, [load, poll])

  useKitFonts(data?.tokens ? kitFontsHref(data.tokens) : null)

  const slides = data?.slides ?? []
  const hasVisuals = slides.length > 0
  // Distinguish "has real imagery" (a plate with a src) from copy-only on-the-fly slides, so an
  // auto-generated (cron) post reads "Generate visuals" rather than "Regenerate".
  const hasImagery = slides.some((s) =>
    (s.composition as Composition).layers.some((l) => l.type === 'plate' && Boolean((l as { src?: string }).src))
  )

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
        <Button size="sm" variant={hasImagery ? 'secondary' : undefined} loading={busy} onClick={() => void generate()}>
          {busy ? 'Generating…' : hasImagery ? 'Regenerate' : 'Generate visuals'}
        </Button>
      </div>

      {hasVisuals && data ? (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {slides.map((s) => (
            <PreviewCell key={s.slideIndex} composition={s.composition} tokens={data.tokens} width={128} />
          ))}
        </div>
      ) : (
        !busy && (
          <div style={{ fontSize: 12, color: 'var(--color-text-2)' }}>
            No visuals yet — generate designed slides from this post&rsquo;s copy.
          </div>
        )
      )}

      {error && <div style={{ fontSize: 12, color: '#c0392b' }}>{error}</div>}
    </div>
  )
}
