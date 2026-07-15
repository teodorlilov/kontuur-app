'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Button } from '@/components/ui/button'
import { buildComposition, loadCompositionImages } from '@/lib/renderer/konva'
import { REFERENCE_MARKS } from '@/lib/renderer/reference-compositions'
import { kitFontsHref } from '@/lib/render/google-fonts'
import { useKitFonts } from '@/lib/render/use-kit-fonts'
import {
  addLayer,
  clampRectToCanvas,
  findLayer,
  removeLayer,
  setLayerRect,
  type BrandTokens,
  type Composition,
  type MarkLayer,
} from '@/lib/scene-graph'
import { LayerPropertyPanel } from './layer-property-panel'
import { ElementPicker, type BrandVector } from './element-picker'

/** A centred mark layer for an inserted brand vector — ~a third of the canvas, draggable/resizable. */
function createMarkLayer(svg: string, size: { w: number; h: number }): MarkLayer {
  const dim = Math.round(Math.min(size.w, size.h) * 0.32)
  return {
    id: `mark-${crypto.randomUUID()}`,
    name: 'element',
    locked: false,
    hidden: false,
    rect: { x: Math.round((size.w - dim) / 2), y: Math.round((size.h - dim) / 2), w: dim, h: dim, rotate: 0 },
    vAnchor: 'center',
    opacity: { mode: 'literal', value: 1 },
    blendMode: { mode: 'literal', value: 'normal' },
    clip: { kind: 'none' },
    type: 'mark',
    packElementId: '',
    roleOverrides: {},
    svg,
  }
}

type SlideData = { slideIndex: number; composition: Composition }
type VisualsResponse = { slides: SlideData[]; tokens: BrandTokens; clientId?: string }

const MAX_CANVAS_W = 460

/**
 * The full-screen visual editor (Phase 5a). Mounts an *interactive* Konva stage — built by the same
 * `buildComposition` the previews and export use, so what you edit is what renders — and lets the operator
 * select a layer and drag it to reposition. Interactions map through the pure `scene-graph/edit` model, so
 * the canvas here is thin glue over tested logic.
 *
 * Two modes, so it's reusable on every surface:
 *  - **Persisted** (review, calendar): pass `postId`; it fetches the stored slides and Save PUTs them back.
 *  - **Draft** (generation wizard, before the post exists): pass `initial` slides + tokens; Save hands the
 *    edited slides back via `onSaveDraft`, and the wizard persists them on approve.
 *
 * Text editing, resize, property panels, image/vector/treatment actions, and PNG export land in later 5x.
 */
export function PostVisualEditor({
  postId,
  open,
  onClose,
  onSaved,
  initial,
  onSaveDraft,
  clientId: clientIdProp,
}: {
  open: boolean
  onClose: () => void
  postId?: string
  onSaved?: () => void
  initial?: { slides: SlideData[]; tokens: BrandTokens }
  onSaveDraft?: (slides: SlideData[]) => void
  /** The client, for the brand vector library. Passed directly in draft mode; else read from the fetch. */
  clientId?: string
}) {
  const [slides, setSlides] = useState<SlideData[] | null>(null)
  const [tokens, setTokens] = useState<BrandTokens | null>(null)
  const [clientId, setClientId] = useState<string | null>(clientIdProp ?? null)
  const [vectors, setVectors] = useState<BrandVector[]>([])
  const [current, setCurrent] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [redrawTick, setRedrawTick] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map())

  useKitFonts(open && tokens ? kitFontsHref(tokens) : null)

  const composition = slides?.[current]?.composition ?? null

  // Load the slides when the editor opens: provided directly (draft mode) or fetched by post id.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSelectedId(null)
    setCurrent(0)
    setDirty(false)
    setClientId(clientIdProp ?? null)
    if (initial) {
      setSlides(initial.slides)
      setTokens(initial.tokens)
      return
    }
    setSlides(null)
    if (!postId) return
    void fetch(`/api/posts/${postId}/visuals`)
      .then((r) => (r.ok ? (r.json() as Promise<VisualsResponse>) : null))
      .then((d) => {
        if (cancelled || !d) return
        setSlides(d.slides)
        setTokens(d.tokens)
        if (d.clientId) setClientId(d.clientId)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` is captured on open; re-open to reset
  }, [open, postId])

  // Load the brand vector library (Elements picker) once the client is known.
  useEffect(() => {
    if (!open || !clientId) return
    let cancelled = false
    void fetch(`/api/clients/${clientId}/vectors`)
      .then((r) => (r.ok ? (r.json() as Promise<{ vectors: BrandVector[] }>) : null))
      .then((d) => {
        if (!cancelled && d) setVectors(d.vectors)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, clientId])

  const updateComposition = useCallback(
    (next: Composition) => {
      setSlides((prev) => (prev ? prev.map((s, i) => (i === current ? { ...s, composition: next } : s)) : prev))
      setDirty(true)
    },
    [current]
  )

  // A signature of the slide's image-bearing content (plate srcs + mark svgs) — changes on a slide switch
  // or a mark insert, but NOT on a drag/resize, so images reload only when the sources actually change.
  const imageSignature = useMemo(() => {
    if (!composition) return ''
    return composition.layers
      .map((l) => (l.type === 'plate' ? `p:${l.id}:${l.src}` : l.type === 'mark' ? `m:${l.id}:${l.svg ?? l.packElementId}` : ''))
      .join('|')
  }, [composition])

  // Load the slide's images (plate srcs + mark SVGs) when they change; edits rebuild synchronously against
  // this cache.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload keyed on image content, not every edit
  }, [open, tokens, imageSignature])

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

  const selectedLayer = selectedId && composition ? findLayer(composition, selectedId) ?? null : null
  const onEdit = useCallback(
    (mutate: (c: Composition) => Composition) => {
      if (composition) updateComposition(mutate(composition))
    },
    [composition, updateComposition]
  )

  const insertVector = useCallback(
    (svg: string) => {
      if (!composition) return
      const mark = createMarkLayer(svg, composition.size)
      updateComposition(addLayer(composition, mark))
      setSelectedId(mark.id)
    },
    [composition, updateComposition]
  )

  const deleteSelected = useCallback(() => {
    if (!composition || !selectedId) return
    updateComposition(removeLayer(composition, selectedId))
    setSelectedId(null)
  }, [composition, selectedId, updateComposition])

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes to the visuals?')) return
    onClose()
  }, [dirty, onClose])

  const save = useCallback(async () => {
    if (!slides) return
    // Draft mode: hand the edited slides back; the wizard persists them on approve.
    if (onSaveDraft) {
      onSaveDraft(slides)
      setDirty(false)
      onClose()
      return
    }
    if (!postId) return
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
  }, [slides, postId, onSaved, onClose, onSaveDraft])

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
          width: 'min(860px, 100%)',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
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

        <div style={{ padding: 18, display: 'flex', gap: 16, minHeight: 220, alignItems: 'flex-start' }}>
          {slides ? (
            <>
              <div style={{ flex: '0 0 auto' }}>
                <div ref={containerRef} style={{ width: MAX_CANVAS_W, maxWidth: '100%' }} />
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-muted)', textAlign: 'center' }}>
                  {selectedLayer ? 'Drag to reposition — or edit properties →' : 'Click an element to select it.'}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 190,
                  borderLeft: '0.5px solid var(--color-border-1)',
                  paddingLeft: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <ElementPicker vectors={vectors} onInsert={insertVector} />
                {selectedLayer && tokens ? (
                  <>
                    <LayerPropertyPanel layer={selectedLayer} tokens={tokens} onEdit={onEdit} />
                    <Button size="sm" variant="ghost" onClick={deleteSelected}>
                      Delete element
                    </Button>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    Select an element to edit its text, colour, size, and position.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--color-muted)', margin: 'auto' }}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  )
}
