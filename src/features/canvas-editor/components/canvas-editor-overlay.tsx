'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Redo2, Undo2 } from 'lucide-react'
import type Konva from 'konva'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MAX_ELEMENTS } from '@/lib/canvas/constants'
import { createCenteredElement, createElementAtRect } from '@/lib/canvas/elements'
import {
  DEFAULT_BACKGROUND_TRANSFORM,
  sourceRectToCanvas,
  zoomBackgroundTo,
} from '@/lib/canvas/reposition'
import { createTextLayer } from '@/lib/canvas/seed-doc'
import { getBrandStyle } from '@/lib/visual/brand-styles'
import { validateImageFile } from '@/features/publishing/lib/validate-image-file'
import type { CanvasTextLayer } from '@/types/canvas'
import type { AssetRef } from '../lib/asset-client'
import { generateSvgAsset, inpaintBackgroundAsset, isolateSubjectAsset, pasteFromUrlAsset, uploadElementAsset } from '../lib/asset-client'
import { imageFileFromTransfer, imageUrlFromTransfer } from '../lib/clipboard-image'
import { buildInpaintMask, compositeInpaintResult } from '../lib/build-inpaint-mask'
import {
  cutoutFromLasso,
  cutoutFromLassoDetect,
  eraseStrokesFromElement,
  removeElementBackground,
  trimTransparentEdges,
} from '../lib/cutout'
import { loadCrossOriginImage, naturalSize } from '../lib/load-image'
import type { BrushStroke, EditorMode } from '../types'
import { useCanvasDoc } from '../hooks/use-canvas-doc'
import { useCrossOriginImage } from '../hooks/use-cross-origin-image'
import { useEditorData } from '../hooks/use-editor-data'
import { useEditorFonts } from '../hooks/use-editor-fonts'
import { useInlineTextEdit } from '../hooks/use-inline-text-edit'
import { usePasteImage } from '../hooks/use-paste-image'
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
/** The "Remove object" brush preset — removal is an inpaint with a fixed, well-tested prompt. */
const REMOVE_OBJECT_PROMPT =
  'remove the marked object completely and seamlessly continue the surrounding background'

/** The full-screen canvas editor. Mounted per position; all Konva code lives beneath this file. */
export function CanvasEditorOverlay(props: CanvasEditorProps) {
  const { target, image, slideCopy, slideLabel, onClose } = props
  const isMobile = useIsMobile(MIN_VIEWPORT_WIDTH)
  const viewport = useViewportSize()
  const data = useEditorData(target, image, slideCopy)
  const docState = useCanvasDoc()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('edit')
  const [strokes, setStrokes] = useState<BrushStroke[]>([])
  const [brushSize, setBrushSize] = useState(60)
  const [inpaintPrompt, setInpaintPrompt] = useState('')
  const [inpainting, setInpainting] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState(false)
  const [isolating, setIsolating] = useState(false)
  const [generatingSvg, setGeneratingSvg] = useState(false)
  const [removingBackground, setRemovingBackground] = useState(false)
  const [lassoCutting, setLassoCutting] = useState(false)
  const [lassoDetect, setLassoDetect] = useState(true)
  const [erasing, setErasing] = useState(false)
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

  // Escape/Cancel/backdrop step OUT of reposition/inpaint mode first; the next attempt closes.
  const attemptClose = useCallback(() => {
    if (mode !== 'edit') {
      setMode('edit')
      setStrokes([])
      return
    }
    if (docState.dirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }, [mode, docState.dirty, onClose])

  // Modes are exclusive: entering one deselects and drops any brush strokes. The eraser is the
  // exception — it operates ON the current selection, so it keeps it.
  const switchMode = useCallback((next: Exclude<EditorMode, 'edit'>) => {
    if (next !== 'erase') setSelectedId(null)
    setStrokes([])
    setMode((current) => (current === next ? 'edit' : next))
  }, [])

  // Guard before any upload work so we never store bytes we can't place (no doc yet, or the schema's
  // element cap is reached).
  const canAddElement = useCallback(() => {
    if (!docState.doc) return false
    if ((docState.doc.elements?.length ?? 0) < MAX_ELEMENTS) return true
    toast.error(`You can add up to ${MAX_ELEMENTS} elements`)
    return false
  }, [docState.doc])

  // Shared tail for every "add an image element" path: place it (at dropPoint if given, else
  // centered) and select it.
  const insertImageElement = useCallback(
    async (src: AssetRef, dropPoint?: { x: number; y: number }) => {
      if (!docState.doc) return
      const asset = await loadCrossOriginImage(src.publicUrl)
      const element = createCenteredElement('image', src, naturalSize(asset), docState.doc.canvas)
      const placed = dropPoint
        ? { ...element, x: dropPoint.x - element.width / 2, y: dropPoint.y - element.height / 2 }
        : element
      docState.addElement(placed)
      setSelectedId(placed.id)
    },
    [docState]
  )

  const addImageFromFile = useCallback(
    async (file: File, dropPoint?: { x: number; y: number }) => {
      const fileError = validateImageFile(file)
      if (fileError) {
        toast.error(fileError)
        return
      }
      if (!canAddElement()) return
      setUploadingAsset(true)
      try {
        await insertImageElement(await uploadElementAsset(target, file), dropPoint)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Asset upload failed')
      } finally {
        setUploadingAsset(false)
      }
    },
    [target, canAddElement, insertImageElement]
  )

  const addImageFromUrl = useCallback(
    async (url: string, dropPoint?: { x: number; y: number }) => {
      if (!canAddElement()) return
      setUploadingAsset(true)
      try {
        await insertImageElement(await pasteFromUrlAsset(target, url), dropPoint)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Paste failed')
      } finally {
        setUploadingAsset(false)
      }
    },
    [target, canAddElement, insertImageElement]
  )

  usePasteImage({
    onFile: (file) => { void addImageFromFile(file) },
    onUrl: (url) => { void addImageFromUrl(url) },
  })

  const removeElement = useCallback(
    (id: string) => {
      docState.removeElement(id)
      setSelectedId((current) => (current === id ? null : current))
    },
    [docState]
  )

  const applyInpaint = useCallback(async (promptOverride?: string) => {
    const prompt = (promptOverride ?? inpaintPrompt).trim()
    if (!docState.doc || !backgroundImage || strokes.length === 0 || !prompt || inpainting) return
    const { background, backgroundTransform, canvas } = docState.doc
    const src = naturalSize(backgroundImage)
    setInpainting(true)
    try {
      const mask = await buildInpaintMask(strokes, src, canvas, backgroundTransform)
      const rawRef = await inpaintBackgroundAsset({
        target,
        storagePath: background.storagePath,
        prompt,
        mask,
        width: src.width,
        height: src.height,
      })
      // The model regenerates globally — composite its output back into the original so only
      // the painted region actually changes, then store THAT as the new clean background.
      const edited = await loadCrossOriginImage(rawRef.publicUrl)
      const composite = await compositeInpaintResult(backgroundImage, edited, strokes, src, canvas, backgroundTransform)
      const ref = await uploadElementAsset(target, new File([composite], 'inpainted.jpg', { type: 'image/jpeg' }))
      // Rebind the clean background in place; undo brings the previous one back (its file
      // survives until save, when the PUT's stale-background cleanup collects it).
      docState.setBackground(ref)
      setStrokes([])
      toast.success('Backdrop updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Inpainting failed')
    } finally {
      setInpainting(false)
    }
  }, [docState, backgroundImage, strokes, inpaintPrompt, inpainting, target])

  const lassoCut = useCallback(async (loopPoints: number[]) => {
    if (!docState.doc || !backgroundImage || lassoCutting) return
    const { backgroundTransform, canvas } = docState.doc
    const src = naturalSize(backgroundImage)
    setLassoCutting(true)
    try {
      // AI-detect: matte the loop's cropped region with the existing BiRefNet, clipped by the
      // loop. Any failure (or an empty matte) falls back to the pure geometric cut.
      let cut = lassoDetect
        ? await cutoutFromLassoDetect(backgroundImage, loopPoints, src, canvas, backgroundTransform, async (regionBlob) => {
            const regionRef = await uploadElementAsset(target, new File([regionBlob], 'lasso-region.png', { type: 'image/png' }))
            const matteRef = await isolateSubjectAsset(target, regionRef.storagePath)
            return loadCrossOriginImage(matteRef.publicUrl)
          }).catch(() => null)
        : null
      cut ??= await cutoutFromLasso(backgroundImage, loopPoints, src, canvas, backgroundTransform)
      if (!cut) {
        toast.error('Draw a bigger loop around the object')
        return
      }
      const ref = await uploadElementAsset(target, new File([cut.blob], 'lasso-cutout.png', { type: 'image/png' }))
      const element = createElementAtRect(ref, sourceRectToCanvas(cut.bbox, src, canvas, backgroundTransform))
      docState.addElement(element)
      setMode('edit')
      setSelectedId(element.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lasso cut failed')
    } finally {
      setLassoCutting(false)
    }
  }, [docState, backgroundImage, lassoCutting, lassoDetect, target])

  // The element the erase/remove-background actions operate on (they require a selection).
  const selectedElement = useCallback(
    () => (docState.doc?.elements ?? []).find((candidate) => candidate.id === selectedId),
    [docState.doc, selectedId]
  )

  const applyErase = useCallback(async () => {
    if (!docState.doc || strokes.length === 0 || erasing) return
    const element = selectedElement()
    if (!element) return
    setErasing(true)
    try {
      const bitmap = await loadCrossOriginImage(element.src.publicUrl)
      const blob = await eraseStrokesFromElement(bitmap, strokes, element)
      const ref = await uploadElementAsset(target, new File([blob], 'erased.png', { type: 'image/png' }))
      // Geometry stays (holes, not a re-trim) — one undo step brings the previous bitmap back.
      docState.updateElement(element.id, { src: ref })
      setStrokes([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erase failed')
    } finally {
      setErasing(false)
    }
  }, [docState, strokes, erasing, selectedElement, target])

  const removeSelectedElementBackground = useCallback(async () => {
    if (!docState.doc || removingBackground) return
    const element = selectedElement()
    if (!element) return
    setRemovingBackground(true)
    try {
      const bitmap = await loadCrossOriginImage(element.src.publicUrl)
      const blob = await removeElementBackground(bitmap)
      if (!blob) {
        toast.error('No flat background detected on this element')
        return
      }
      const ref = await uploadElementAsset(target, new File([blob], 'keyed.png', { type: 'image/png' }))
      // An SVG that needed rasterized keying is a bitmap from here on.
      docState.updateElement(element.id, { src: ref, kind: 'image' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Background removal failed')
    } finally {
      setRemovingBackground(false)
    }
  }, [docState, removingBackground, selectedElement, target])

  const setSelectedElementAsBackground = useCallback(() => {
    if (!selectedId) return
    docState.setElementAsBackground(selectedId)
    setSelectedId(null)
    toast.success('Background updated')
  }, [docState, selectedId])

  const generateSvg = useCallback(async (prompt: string) => {
    if (!docState.doc || generatingSvg) return
    const { canvas } = docState.doc
    setGeneratingSvg(true)
    try {
      const asset = await generateSvgAsset(target, prompt)
      const element = createCenteredElement(
        'svg',
        { publicUrl: asset.publicUrl, storagePath: asset.storagePath },
        { width: asset.width, height: asset.height },
        canvas
      )
      docState.addElement(element)
      setSelectedId(element.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Vector generation failed')
    } finally {
      setGeneratingSvg(false)
    }
  }, [docState, generatingSvg, target])

  const isolateSubject = useCallback(async () => {
    if (!docState.doc || isolating) return
    const { background, backgroundTransform, canvas } = docState.doc
    setIsolating(true)
    try {
      const fullRef = await isolateSubjectAsset(target, background.storagePath)
      const fullCutout = await loadCrossOriginImage(fullRef.publicUrl)
      // Trim to the subject so the element (and its resize handles) hugs the object instead of
      // spanning the whole frame; the bbox then lands pixel-exact through the inverse crop.
      const trimmed = await trimTransparentEdges(fullCutout)
      if (!trimmed) {
        toast.error('No subject found in this image')
        return
      }
      const ref = await uploadElementAsset(target, new File([trimmed.blob], 'cutout.png', { type: 'image/png' }))
      const element = createElementAtRect(
        ref,
        sourceRectToCanvas(trimmed.bbox, naturalSize(fullCutout), canvas, backgroundTransform)
      )
      docState.addElement(element)
      setSelectedId(element.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Subject isolation failed')
    } finally {
      setIsolating(false)
    }
  }, [docState, target, isolating])

  const backgroundZoom = useCallback(
    (zoom: number) => {
      if (!docState.doc || !backgroundImage) return
      const canvas = docState.doc.canvas
      docState.setBackgroundTransform(
        zoomBackgroundTo(
          docState.doc.backgroundTransform ?? DEFAULT_BACKGROUND_TRANSFORM,
          zoom,
          { x: canvas.w / 2, y: canvas.h / 2 },
          naturalSize(backgroundImage),
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
        canSave={Boolean(ready) && !saving && mode === 'edit'}
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
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                const point = { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }
                const file = imageFileFromTransfer(event.dataTransfer)
                if (file) return void addImageFromFile(file, point)
                const url = imageUrlFromTransfer(event.dataTransfer)
                if (url) void addImageFromUrl(url, point)
              }}
              style={{
                lineHeight: 0,
                border: '1px solid var(--line2)',
                borderRadius: 4,
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(15,21,18,0.12)',
                background: 'var(--surface)',
              }}
            >
              <EditorStage
                doc={docState.doc!}
                backgroundImage={backgroundImage!}
                scale={scale}
                selectedId={selectedId}
                editingId={editingId}
                mode={mode}
                brushSize={brushSize}
                strokes={strokes}
                onSelect={setSelectedId}
                onLayerChange={docState.updateLayer}
                onElementChange={docState.updateElement}
                onStartEdit={(layer: CanvasTextLayer, node: Konva.Text) => startEdit(layer, node, scale)}
                onBackgroundTransform={docState.setBackgroundTransform}
                onStrokeEnd={(stroke) => {
                  if (mode === 'lasso') void lassoCut(stroke.points)
                  else setStrokes((current) => [...current, stroke])
                }}
              />
            </div>
          )}
        </div>
        <aside
          style={{
            width: PANEL_WIDTH,
            flexShrink: 0,
            background: 'var(--paper)',
            borderLeft: '1px solid var(--line)',
            overflowY: 'auto',
          }}
        >
          {ready && data.status === 'ready' && (
            <PropertiesPanel
              doc={docState.doc!}
              palette={data.identity.palette}
              selectedId={selectedId}
              repositionMode={mode === 'reposition'}
              uploadingAsset={uploadingAsset}
              isolating={isolating}
              onToggleReposition={() => switchMode('reposition')}
              onBackgroundZoom={backgroundZoom}
              onBackgroundReset={() => docState.setBackgroundTransform(undefined)}
              inpaint={{
                active: mode === 'inpaint',
                applying: inpainting,
                prompt: inpaintPrompt,
                brushSize,
                hasStrokes: strokes.length > 0,
                onToggle: () => switchMode('inpaint'),
                onPromptChange: setInpaintPrompt,
                onBrushSizeChange: setBrushSize,
                onClearStrokes: () => setStrokes([]),
                onApply: () => { void applyInpaint() },
                onRemoveObject: () => { void applyInpaint(REMOVE_OBJECT_PROMPT) },
              }}
              lasso={{
                active: mode === 'lasso',
                cutting: lassoCutting,
                detectObject: lassoDetect,
                onDetectObjectChange: setLassoDetect,
                onToggle: () => switchMode('lasso'),
              }}
              erase={{
                active: mode === 'erase',
                applying: erasing,
                brushSize,
                hasStrokes: strokes.length > 0,
                onBrushSizeChange: setBrushSize,
                onClearStrokes: () => setStrokes([]),
                onApply: () => { void applyErase() },
                onToggle: () => switchMode('erase'),
              }}
              onLassoCut={() => switchMode('lasso')}
              onEraseSelected={() => switchMode('erase')}
              generatingSvg={generatingSvg}
              onGenerateSvg={(prompt) => { void generateSvg(prompt) }}
              removingBackground={removingBackground}
              onRemoveElementBackground={() => { void removeSelectedElementBackground() }}
              onSetElementAsBackground={setSelectedElementAsBackground}
              onElementChange={docState.updateElement}
              onMoveElement={docState.moveElement}
              onRemoveElement={removeElement}
              onUploadElement={(file) => { void addImageFromFile(file) }}
              onIsolateSubject={() => { void isolateSubject() }}
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
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--sunken)' }}
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
        color: 'var(--text2)',
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
        borderBottom: '1px solid var(--line)',
        background: 'var(--paper)',
      }}
    >
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
        {props.slideLabel}
      </span>
      {props.overflows && (
        <span
          title="Some text does not fit its slot — shorten it or reduce the font size."
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--danger)' }}
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
        border: '1px solid var(--line)',
        background: 'transparent',
        color: 'var(--text2)',
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

