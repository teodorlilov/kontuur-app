'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Redo2, Undo2 } from 'lucide-react'
import type Konva from 'konva'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { useIsMobile } from '@/hooks/useIsMobile'
import { DEFAULT_BACKGROUND_TRANSFORM, zoomBackgroundTo } from '@/lib/canvas/reposition'
import { createTextLayer } from '@/lib/canvas/seed-doc'
import { getBrandStyle } from '@/lib/visual/brand-styles'
import type { CanvasTextLayer } from '@/types/canvas'
import { useCanvasDoc } from '../hooks/use-canvas-doc'
import { useCrossOriginImage } from '../hooks/use-cross-origin-image'
import { useEditorData } from '../hooks/use-editor-data'
import { useEditorFonts } from '../hooks/use-editor-fonts'
import { useInlineTextEdit } from '../hooks/use-inline-text-edit'
import { exportDocToJpegBlob } from '../lib/export-doc'
import { autofitDocLayers, docOverflows } from '../lib/measure-fit'
import { saveDraftCanvas, savePostCanvas } from '../lib/save-canvas'
import type { CanvasEditorProps } from '../types'
import { EditorStage } from './editor-stage'
import { PropertiesPanel } from './properties-panel'

const PANEL_WIDTH = 300
const TOP_BAR_HEIGHT = 56
const STAGE_PADDING = 48
const MIN_VIEWPORT_WIDTH = 768

/** The full-screen canvas editor. Mounted per position; all Konva code lives beneath this file. */
export function CanvasEditorOverlay(props: CanvasEditorProps) {
  const { target, image, slideCopy, slideLabel, onClose } = props
  const isMobile = useIsMobile(MIN_VIEWPORT_WIDTH)
  const viewport = useViewportSize()
  const data = useEditorData(target, image, slideCopy)
  const docState = useCanvasDoc()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [repositionMode, setRepositionMode] = useState(false)
  // Which save mode is in flight — 'all' = Save & apply to all (both buttons share the guard).
  const [saving, setSaving] = useState<'save' | 'all' | false>(false)

  const families = useMemo(() => {
    if (data.status !== 'ready') return []
    const style = getBrandStyle(data.identity.style)
    const docFamilies = (docState.doc ?? data.doc).layers.map((layer) => layer.fontFamily)
    return [...new Set([...docFamilies, style.fonts.display, style.fonts.body])]
  }, [data, docState.doc])

  const fontsReady = useEditorFonts(families)
  // Later font-family switches must not unmount the stage — only first readiness gates rendering;
  // `fontsReady` flipping true again after a switch re-renders (and thus redraws) the loaded face.
  const [initialFontsReady, setInitialFontsReady] = useState(false)
  useEffect(() => {
    if (fontsReady) setInitialFontsReady(true)
  }, [fontsReady])
  const backgroundUrl = data.status === 'ready' ? (docState.doc ?? data.doc).background.publicUrl : null
  const backgroundImage = useCrossOriginImage(backgroundUrl)
  const { editingId, startEdit } = useInlineTextEdit((id, text) =>
    docState.updateLayer(id, { text, textOverridden: true })
  )

  // Initialize the doc state once fonts can measure — seeded layers autofit before first paint.
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current || !fontsReady || data.status !== 'ready') return
    initializedRef.current = true
    docState.initDoc(data.seeded ? autofitDocLayers(data.doc) : data.doc)
  }, [fontsReady, data, docState])

  // Escape/Cancel/backdrop step OUT of reposition mode first; only the next attempt closes.
  const attemptClose = useCallback(() => {
    if (repositionMode) {
      setRepositionMode(false)
      return
    }
    if (docState.dirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }, [repositionMode, docState.dirty, onClose])

  const toggleReposition = useCallback(() => {
    setSelectedId(null)
    setRepositionMode((mode) => !mode)
  }, [])

  const backgroundZoom = useCallback(
    (zoom: number) => {
      if (!docState.doc || !backgroundImage) return
      const canvas = docState.doc.canvas
      docState.setBackgroundTransform(
        zoomBackgroundTo(
          docState.doc.backgroundTransform ?? DEFAULT_BACKGROUND_TRANSFORM,
          zoom,
          { x: canvas.w / 2, y: canvas.h / 2 },
          { width: backgroundImage.naturalWidth, height: backgroundImage.naturalHeight },
          canvas
        )
      )
    },
    [docState, backgroundImage]
  )

  useEditorShortcuts({
    onClose: attemptClose,
    undo: docState.undo,
    redo: docState.redo,
    removeSelected: () => {
      if (selectedId) {
        docState.removeLayer(selectedId)
        setSelectedId(null)
      }
    },
  })

  const performSave = useCallback(async (applyToAll: boolean) => {
    if (!docState.doc || !backgroundImage || saving) return
    setSaving(applyToAll ? 'all' : 'save')
    try {
      const blob = await exportDocToJpegBlob(docState.doc, backgroundImage)
      if (target.kind === 'post') {
        props.onSaved?.(await savePostCanvas(target.postId, target.position, docState.doc, blob, image.storagePath))
      } else {
        // Replace the previous FLATTENED file only — the clean background must survive re-editing.
        const previousPath = image.storagePath !== docState.doc.background.storagePath ? image.storagePath : undefined
        const { visual, doc } = await saveDraftCanvas(target, docState.doc, blob, previousPath)
        props.onSavedDraft?.(visual, doc)
      }
      // Siblings restyle AFTER this slide saved — the surface orchestrates them with its own state.
      if (applyToAll) props.onApplyToAll?.(docState.doc)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Saving the design failed')
    } finally {
      setSaving(false)
    }
  }, [docState.doc, backgroundImage, saving, target, image.storagePath, props, onClose])

  if (isMobile) {
    return (
      <Backdrop onClose={onClose}>
        <CenterNotice>
          The canvas editor needs a larger screen — open it on a desktop.
          <Button variant="secondary" size="sm" onClick={onClose} style={{ marginTop: 12 }}>
            Close
          </Button>
        </CenterNotice>
      </Backdrop>
    )
  }

  const ready = data.status === 'ready' && initialFontsReady && backgroundImage && docState.doc
  const scale = Math.min(
    (viewport.width - PANEL_WIDTH - STAGE_PADDING) / (docState.doc?.canvas.w ?? 1080),
    (viewport.height - TOP_BAR_HEIGHT - STAGE_PADDING) / (docState.doc?.canvas.h ?? 1350),
    1
  )
  const overflows = docState.doc && fontsReady ? docOverflows(docState.doc) : false

  return (
    <Backdrop onClose={attemptClose}>
      <TopBar
        slideLabel={slideLabel}
        overflows={overflows}
        canUndo={docState.canUndo}
        canRedo={docState.canRedo}
        undo={docState.undo}
        redo={docState.redo}
        saving={saving === 'save'}
        applying={saving === 'all'}
        canSave={Boolean(ready) && !saving && !repositionMode}
        onCancel={attemptClose}
        onSave={() => { void performSave(false) }}
        onApplyToAll={props.onApplyToAll ? () => { void performSave(true) } : undefined}
      />
      <div style={{ display: 'flex', height: `calc(100% - ${TOP_BAR_HEIGHT}px)` }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {data.status === 'error' && <CenterNotice>{data.message}</CenterNotice>}
          {data.status !== 'error' && !ready && (
            <CenterNotice>
              <Spinner size="md" />
              <span style={{ marginTop: 10 }}>Preparing canvas…</span>
            </CenterNotice>
          )}
          {ready && (
            <div
              style={{
                lineHeight: 0,
                border: '0.5px solid var(--color-border-2)',
                borderRadius: 4,
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(44,62,80,0.12)',
                background: 'var(--color-surface)',
              }}
            >
              <EditorStage
                doc={docState.doc!}
                backgroundImage={backgroundImage!}
                scale={scale}
                selectedId={selectedId}
                editingId={editingId}
                repositionMode={repositionMode}
                onSelect={setSelectedId}
                onLayerChange={docState.updateLayer}
                onStartEdit={(layer: CanvasTextLayer, node: Konva.Text) => startEdit(layer, node, scale)}
                onBackgroundTransform={docState.setBackgroundTransform}
              />
            </div>
          )}
        </div>
        <aside
          style={{
            width: PANEL_WIDTH,
            flexShrink: 0,
            background: 'var(--color-page)',
            borderLeft: '0.5px solid var(--color-border-1)',
            overflowY: 'auto',
          }}
        >
          {ready && data.status === 'ready' && (
            <PropertiesPanel
              doc={docState.doc!}
              palette={data.identity.palette}
              selectedId={selectedId}
              repositionMode={repositionMode}
              onToggleReposition={toggleReposition}
              onBackgroundZoom={backgroundZoom}
              onBackgroundReset={() => docState.setBackgroundTransform(undefined)}
              onSelect={setSelectedId}
              onLayerChange={docState.updateLayer}
              onAddLayer={() => {
                const layer = createTextLayer('custom', data.identity)
                docState.addLayer(layer)
                setSelectedId(layer.id)
              }}
              onRemoveLayer={(id) => {
                docState.removeLayer(id)
                if (selectedId === id) setSelectedId(null)
              }}
              onScrimChange={docState.setScrim}
            />
          )}
        </aside>
      </div>
    </Backdrop>
  )
}

export default CanvasEditorOverlay

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--color-sunken)' }}
    >
      {children}
    </div>
  )
}

function CenterNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        color: 'var(--color-text-2)',
        fontSize: '13px',
        fontFamily: 'var(--font-sans)',
        textAlign: 'center',
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}

interface TopBarProps {
  slideLabel: string
  overflows: boolean
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  saving: boolean
  applying: boolean
  canSave: boolean
  onCancel: () => void
  onSave: () => void
  onApplyToAll?: () => void
}

function TopBar(props: TopBarProps) {
  return (
    <div
      style={{
        height: TOP_BAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        borderBottom: '0.5px solid var(--color-border-1)',
        background: 'var(--color-page)',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-1)', fontFamily: 'var(--font-sans)' }}>
        {props.slideLabel}
      </span>
      {props.overflows && (
        <span
          title="Some text does not fit its slot — shorten it or reduce the font size."
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-error-fg)' }}
        >
          <AlertTriangle size={13} /> Text overflows
        </span>
      )}
      <div style={{ flex: 1 }} />
      <IconButton title="Undo (⌘Z)" disabled={!props.canUndo} onClick={props.undo}>
        <Undo2 size={15} />
      </IconButton>
      <IconButton title="Redo (⇧⌘Z)" disabled={!props.canRedo} onClick={props.redo}>
        <Redo2 size={15} />
      </IconButton>
      <Button variant="secondary" size="sm" onClick={props.onCancel}>
        Cancel
      </Button>
      {props.onApplyToAll && (
        <Button
          variant="secondary"
          size="sm"
          loading={props.applying}
          disabled={!props.canSave}
          onClick={props.onApplyToAll}
          title="Save this slide and carry its style onto every other slide (each keeps its own text)"
        >
          Save &amp; apply to all
        </Button>
      )}
      <Button size="sm" loading={props.saving} disabled={!props.canSave} onClick={props.onSave}>
        Save
      </Button>
    </div>
  )
}

function IconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        border: '0.5px solid var(--color-border-1)',
        background: 'transparent',
        color: 'var(--color-text-2)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

function useViewportSize() {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

function useEditorShortcuts(handlers: {
  onClose: () => void
  undo: () => void
  redo: () => void
  removeSelected: () => void
}) {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Shortcuts stay suspended while typing (inline-edit textarea, panel inputs).
      if (target && ['TEXTAREA', 'INPUT', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'Escape') return ref.current.onClose()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        return event.shiftKey ? ref.current.redo() : ref.current.undo()
      }
      if (event.key === 'Delete' || event.key === 'Backspace') ref.current.removeSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

