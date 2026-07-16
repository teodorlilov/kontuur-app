'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ComposedSlides } from '@/components/posts/composed-slides'
import { PostVisualEditor } from '@/features/visual-editor/components/post-visual-editor'
import { composePostSlides } from '@/lib/renderer/compose'
import type { BrandTokens, Composition } from '@/lib/scene-graph'
import type { CarouselSlide, PostSlide } from '@/types/api'

type VisualKit = { tokens: BrandTokens; feedSystemSlug: string; clientName: string }

/**
 * The designed slides for a wizard-results post (pre-save). The copy composes in-browser; the real fal
 * imagery is generated automatically (this is the manual generation flow, so the spend is intended) and
 * shown under the type — cached by slide-copy hash so a save reuses it. "Regenerate" re-runs after copy
 * edits. "Edit" opens the full visual editor in *draft* mode (no post row yet); edits reflect in the
 * preview and are handed up via `onVisualsChange` so `approve` persists them as `post_visuals`.
 */
export function PostVisualsPreview({
  clientId,
  slides,
  onVisualsChange,
  onRenderable,
}: {
  clientId: string
  slides: CarouselSlide[]
  onVisualsChange?: (visuals: Array<{ slideIndex: number; composition: unknown }> | null) => void
  /** Reports the currently-displayed slides + tokens so approve can render them to post_images. */
  onRenderable?: (bundle: { slides: PostSlide[]; tokens: BrandTokens } | null) => void
}) {
  const [kit, setKit] = useState<VisualKit | null>(null)
  const [serverSlides, setServerSlides] = useState<PostSlide[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [edited, setEdited] = useState<Composition[] | null>(null)
  const [editing, setEditing] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/clients/${clientId}/visual-kit`)
      .then((r) => (r.ok ? (r.json() as Promise<VisualKit>) : Promise.reject(new Error(`visual-kit ${r.status}`))))
      .then((k) => {
        if (!cancelled) setKit(k)
      })
      .catch((e) => {
        // No kit → imagery can't auto-generate (this is the "nothing triggered" case). Surfaced so a
        // client with a missing/failed kit is diagnosable instead of silently bare.
        if (!cancelled) console.error(`[visuals] visual-kit failed for client ${clientId} — imagery will not generate:`, e)
      })
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
      const data = (await res.json().catch(() => ({}))) as { slides?: PostSlide[] }
      if (res.ok) setServerSlides(data.slides ?? [])
    } catch {
      // fail-soft: leave the copy-only compositions (gradients / colour grounds)
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

  // Copy changed → the previous edit and generated imagery are stale (built from old copy); drop them so
  // the preview recomposes copy-only and approve doesn't persist visuals from old copy. The operator
  // clicks Regenerate for fresh imagery.
  useEffect(() => {
    setEdited(null)
    setServerSlides(null)
    onVisualsChange?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the copy itself changes
  }, [slides])

  // The copy-only compositions — the placeholder shown before imagery arrives (and the fallback if it
  // fails). Once generated, the server's fully-filled compositions (plates + vector marks) take over.
  const baseCompositions = useMemo<Composition[] | null>(() => {
    if (!kit || slides.length === 0) return null
    return composePostSlides(slides, { feedSystemSlug: kit.feedSystemSlug, postId: 'preview', clientName: kit.clientName })
  }, [kit, slides])

  const displayCompositions = edited ?? (serverSlides ? serverSlides.map((s) => s.composition) : baseCompositions)

  // Report the current slides + tokens up so approve can render them to post_images (publishable images),
  // whether or not the operator opened the editor.
  useEffect(() => {
    if (!onRenderable) return
    if (kit && displayCompositions) {
      onRenderable({ slides: displayCompositions.map((composition, slideIndex) => ({ slideIndex, composition })), tokens: kit.tokens })
    } else {
      onRenderable(null)
    }
  }, [kit, displayCompositions, onRenderable])

  const editorInitial = useMemo(() => {
    if (!kit || !displayCompositions) return null
    return {
      slides: displayCompositions.map<PostSlide>((composition, slideIndex) => ({ slideIndex, composition })),
      tokens: kit.tokens,
    }
  }, [kit, displayCompositions])

  const handleSaveDraft = useCallback(
    (next: PostSlide[]) => {
      setEdited(next.map((s) => s.composition))
      onVisualsChange?.(next.map((s) => ({ slideIndex: s.slideIndex, composition: s.composition })))
    },
    [onVisualsChange]
  )

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
        <div style={{ display: 'flex', gap: 8 }}>
          {displayCompositions && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <Button size="sm" variant="secondary" loading={generating} onClick={() => void generate()}>
            {generating ? 'Generating…' : serverSlides ? 'Regenerate' : 'Generate visuals'}
          </Button>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <ComposedSlides
          slides={slides}
          tokens={kit.tokens}
          feedSystemSlug={kit.feedSystemSlug}
          clientName={kit.clientName}
          compositions={displayCompositions ?? undefined}
        />
        {generating && !serverSlides && (
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

      {editorInitial && (
        <PostVisualEditor
          open={editing}
          onClose={() => setEditing(false)}
          initial={editorInitial}
          onSaveDraft={handleSaveDraft}
          clientId={clientId}
        />
      )}
    </div>
  )
}
