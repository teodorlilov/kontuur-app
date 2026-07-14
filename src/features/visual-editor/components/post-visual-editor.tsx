'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Konva from 'konva'
import { Button } from '@/components/ui/button'
import { buildComposition, loadCompositionImages } from '@/lib/renderer/konva'
import { REFERENCE_MARKS } from '@/lib/renderer/reference-compositions'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { useKitFonts } from '@/lib/render/use-kit-fonts'
import { clampRectToCanvas, findLayer, setLayerRect, type BrandTokens, type Composition } from '@/lib/scene-graph'

type SlideData = { slideIndex: number; composition: Composition }
type VisualsResponse = { slides: SlideData[]; tokens: BrandTokens }

const MAX_CANVAS_W = 460

/**
 * The full-screen visual editor (Phase 5a). Loads a post's designed slides, mounts an *interactive* Konva
 * stage — built by the same `buildComposition` the previews and export use, so what you edit is what
 * renders — and lets the operator select a layer and drag it to reposition. Save (PUT `…/visuals`) writes
 * the edited `composition_json` back. Text editing, resize, property panels, image/vector/treatment
 * actions, and PNG export land in later 5x slices. Interactions map through the pure `scene-graph/edit`
 * model, so the canvas here is thin glue over tested logic.
 */
export function PostVisualEditor({
  postId,
  open,
  onClose,
  onSaved,
}: {
  postId: string
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const [slides, setSlides] = useState<SlideData[] | null>(null)
  const [tokens, setTokens] = useState<BrandTokens | null>(null)
  const [current, setCurrent] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [redrawTick, setRedrawTick] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  useKitFonts(open && tokens ? kitFontsHref(tokens) : null)

  const composition = slides?.[current]?.composition ?? null

  // Load the post's slides + kit tokens when the editor opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSlides(null)
    setSelectedId(null)
    setCurrent(0)
    setDirty(false)
    void fetch(`/api/posts/${postId}/visuals`)
      .then((r) => (r.ok ? (r.json() as Promise<VisualsResponse>) : null))
      .then((d) => {
        if (cancelled || !d) return
        setSlides(d.slides)
        setTokens(d.tokens)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, postId])

  const updateComposition = useCallback(
    (next: Composition) => {
      setSlides((prev) => (prev ? prev.map((s, i) => (i === current ? { ...s, composition: next } : s)) : prev))
      setDirty(true)
    },
    [current]
  )

  // Load the current slide's images (plate srcs + mark SVGs) — only on slide switch; the srcs don't change
  // while dragging, so edits rebuild synchronously against this cache.
  useEffect(() => {
    if (!open || !composition || !tokens) return
    let cancelled = false
    void loadCompositionImages(composition, tokens, REFERENCE_MARKS).then((imgs) => {
      if (cancelled) return
      imagesRef.current = imgs
      setRedrawTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload images on slide switch, not per drag
  }, [open, current, tokens])

  // Redraw once the kit fonts are ready, so text doesn't render in a fallback face.
  useEffect(() => {
    if (!open || typeof document === 'undefined' || !document.fonts) return
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (!cancelled) setRedrawTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [open, tokens])

  // Build the interactive stage from the current composition. Re-runs on any composition/selection change
  // (a drag commits a new rect → rebuild at the new position, no visual jump). Wires selection + drag sync.
  useEffect(() => {
    const container = containerRef.current
    if (!open || !container || !composition || !tokens) return

    const { w, h } = composition.size
    const displayW = Math.min(container.clientWidth || MAX_CANVAS_W, MAX_CANVAS_W)
    const scale = displayW / w

    const stage = new Konva.Stage({ container, width: displayW, height: h * scale })
    const layer = new Konva.Layer({ scaleX: scale, scaleY: scale })
    layer.add(new Konva.Rect({ width: w, height: h, fill: tokens.color.surface, listening: false }))

    const root = buildComposition(composition, tokens, imagesRef.current, { interactive: true })
    layer.add(root)

    // Selection outline: a dashed accent border on the selected layer's group (moves with it while dragging).
    if (selectedId) {
      const group = root.getChildren((n) => n.name() === selectedId)[0] as Konva.Group | undefined
      const sel = findLayer(composition, selectedId)
      if (group && sel) {
        group.add(
          new Konva.Rect({
            width: sel.rect.w,
            height: sel.rect.h,
            stroke: tokens.color.accent,
            strokeWidth: 2 / scale,
            dash: [8 / scale, 5 / scale],
            listening: false,
          })
        )
      }
    }

    stage.add(layer)

    stage.on('click tap', (e) => {
      if (e.target === stage) {
        setSelectedId(null)
        return
      }
      let node: Konva.Node | null = e.target
      while (node && node.getParent() !== root) node = node.getParent()
      setSelectedId(node ? node.name() || null : null)
    })

    layer.on('dragend', (e) => {
      const group = e.target as Konva.Group
      const layerId = group.name()
      const target = findLayer(composition, layerId)
      if (!target) return
      const moved = clampRectToCanvas(
        { ...target.rect, x: group.x() - target.rect.w / 2, y: group.y() - target.rect.h / 2 },
        composition.size
      )
      updateComposition(setLayerRect(composition, layerId, moved))
    })

    layer.draw()
    return () => {
      stage.destroy()
    }
  }, [open, composition, tokens, selectedId, redrawTick, updateComposition])

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes to the visuals?')) return
    onClose()
  }, [dirty, onClose])

  const save = useCallback(async () => {
    if (!slides) return
    setSaving(true)
    try {
      const res = await fetch(`/api/posts/${postId}/visuals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: slides.map((s) => ({ slideIndex: s.slideIndex, composition: s.composition })) }),
      })
      if (res.ok) {
        setDirty(false)
        onSaved?.()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }, [slides, postId, onSaved, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(20,18,16,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 16,
          border: '0.5px solid var(--color-border-1)',
          width: 'min(760px, 100%)',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '0.5px solid var(--color-border-1)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.4 }}>Edit visuals</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={handleClose}>
              Close
            </Button>
            <Button size="sm" loading={saving} disabled={!dirty} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {slides && slides.length > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '10px 18px 0', flexWrap: 'wrap' }}>
            {slides.map((s, i) => (
              <button
                key={s.slideIndex}
                onClick={() => {
                  setSelectedId(null)
                  setCurrent(i)
                }}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '0.5px solid var(--color-border-1)',
                  background: i === current ? 'var(--color-ink)' : 'transparent',
                  color: i === current ? 'var(--color-surface)' : 'var(--color-text-2)',
                  cursor: 'pointer',
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: 18, display: 'flex', justifyContent: 'center', minHeight: 200 }}>
          {slides ? (
            <div ref={containerRef} style={{ width: MAX_CANVAS_W, maxWidth: '100%' }} />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--color-muted)', alignSelf: 'center' }}>Loading…</div>
          )}
        </div>

        <div style={{ padding: '0 18px 14px', fontSize: 11, color: 'var(--color-muted)', textAlign: 'center' }}>
          {selectedId ? 'Drag the selected element to reposition it.' : 'Click an element to select it.'}
        </div>
      </div>
    </div>
  )
}
