'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { CanvasBackgroundTransform, CanvasDoc, CanvasElement, CanvasTextLayer } from '@/types/canvas'
import { MIN_ELEMENT_SIZE, MIN_TEXT_LAYER_WIDTH } from '@/lib/canvas/constants'
import { coverCrop } from '@/lib/canvas/cover-crop'
import { backgroundNodeAttrs, scrimNodeAttrs } from '@/lib/canvas/node-attrs'
import {
  DEFAULT_BACKGROUND_TRANSFORM,
  panBackground,
  zoomBackgroundTo,
} from '@/lib/canvas/reposition'
import type { BrushStroke, EditorMode } from '../types'
import { naturalSize } from '../lib/load-image'
import {
  BrushSurface,
  ERASE_STROKE_COLOR,
  INPAINT_STROKE_COLOR,
  LASSO_PREVIEW_WIDTH,
  LASSO_STROKE_COLOR,
} from './brush-surface'
import { ElementNode } from './element-node'
import { TextNode } from './text-node'

/** Wheel-to-zoom feel: ~1 full zoom step per ~460px of wheel travel. */
const WHEEL_ZOOM_RATE = 0.0015
/** Wheel gestures settle into ONE doc commit (and one undo step) after this pause. */
const WHEEL_COMMIT_DELAY_MS = 150

interface EditorStageProps {
  doc: CanvasDoc
  backgroundImage: HTMLImageElement
  scale: number
  selectedId: string | null
  editingId: string | null
  mode: EditorMode
  brushSize: number
  strokes: BrushStroke[]
  onSelect: (id: string | null) => void
  onLayerChange: (id: string, patch: Partial<CanvasTextLayer>) => void
  onElementChange: (id: string, patch: Partial<CanvasElement>) => void
  onStartEdit: (layer: CanvasTextLayer, node: Konva.Text) => void
  onBackgroundTransform: (transform: CanvasBackgroundTransform) => void
  onStrokeEnd: (stroke: BrushStroke) => void
}

// Konva's Transformer box shape (screen space).
interface TransformerBox {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

// Text resizes by width only (re-wrap); elements resize by corners with the aspect locked.
function transformerConfigFor(selectedKind: 'text' | 'element', scale: number) {
  if (selectedKind === 'element') {
    return {
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      keepRatio: true,
      boundBoxFunc: (oldBox: TransformerBox, newBox: TransformerBox) =>
        newBox.width < MIN_ELEMENT_SIZE * scale || newBox.height < MIN_ELEMENT_SIZE * scale ? oldBox : newBox,
    }
  }
  return {
    enabledAnchors: ['middle-left', 'middle-right'],
    keepRatio: false,
    boundBoxFunc: (oldBox: TransformerBox, newBox: TransformerBox) =>
      newBox.width < MIN_TEXT_LAYER_WIDTH * scale ? oldBox : newBox,
  }
}

/** The live canvas: background (cover-cropped) → scrim → text layers → selection Transformer. */
export function EditorStage({
  doc,
  backgroundImage,
  scale,
  selectedId,
  editingId,
  mode,
  brushSize,
  strokes,
  onSelect,
  onLayerChange,
  onElementChange,
  onStartEdit,
  onBackgroundTransform,
  onStrokeEnd,
}: EditorStageProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const backgroundRef = useRef<Konva.Image>(null)
  // Bumped when an element's asset finishes loading — its Konva node appears AFTER selection,
  // so the attach effect must re-run then or a freshly added element never gets its frame.
  const [nodesReady, setNodesReady] = useState(0)
  const handleNodeReady = useCallback(() => setNodesReady((count) => count + 1), [])

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    // Match by predicate, never by '#id' selector: Konva compares selector strings verbatim (no
    // CSS unescaping), so an escaped uuid that starts with a digit silently matches nothing and
    // the selected node loses its Transformer frame.
    const node =
      selectedId && selectedId !== editingId
        ? stage.findOne((candidate: Konva.Node) => candidate.id() === selectedId)
        : null
    transformer.nodes(node ? [node] : [])
  }, [selectedId, editingId, doc.layers, doc.elements, nodesReady])

  const scrim = scrimNodeAttrs(doc.scrim, doc.canvas)
  const src = naturalSize(backgroundImage)
  const elements = doc.elements ?? []
  const selectedKind = elements.some((element) => element.id === selectedId) ? 'element' : 'text'

  const deselectOnEmpty = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (event.target === event.target.getStage()) onSelect(null)
  }
  const renderElement = (element: CanvasElement) => (
    <ElementNode
      key={element.id}
      element={element}
      canvas={doc.canvas}
      stageScale={scale}
      onSelect={() => onSelect(element.id)}
      onChange={(patch) => onElementChange(element.id, patch)}
      onNodeReady={handleNodeReady}
    />
  )

  return (
    <Stage
      ref={stageRef}
      width={doc.canvas.w * scale}
      height={doc.canvas.h * scale}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={deselectOnEmpty}
      onTouchStart={deselectOnEmpty}
    >
      <Layer>
        <KonvaImage
          ref={backgroundRef}
          image={backgroundImage}
          listening={false}
          {...backgroundNodeAttrs(src, doc.canvas, doc.backgroundTransform)}
        />
        {/* Dim + lock the composition during background modes; the eraser needs full visibility. */}
        <Group opacity={mode === 'edit' || mode === 'erase' ? 1 : 0.35} listening={mode === 'edit'}>
          {scrim && <Rect listening={false} {...scrim} />}
          {/* Elements render below text by default; promoted ones come after the text band. */}
          {elements.filter((element) => !element.aboveText).map(renderElement)}
          {doc.layers.map((layer) => (
            <TextNode
              key={layer.id}
              layer={layer}
              canvas={doc.canvas}
              stageScale={scale}
              hidden={editingId === layer.id}
              onSelect={() => onSelect(layer.id)}
              onChange={(patch) => onLayerChange(layer.id, patch)}
              onStartEdit={(node) => onStartEdit(layer, node)}
            />
          ))}
          {elements.filter((element) => element.aboveText).map(renderElement)}
        </Group>
        <Transformer
          ref={transformerRef}
          rotateEnabled
          rotationSnaps={[-90, -45, 0, 45, 90, 180]}
          rotationSnapTolerance={6}
          {...transformerConfigFor(selectedKind, scale)}
        />
        {mode === 'reposition' && (
          <RepositionSurface
            transform={doc.backgroundTransform}
            src={src}
            canvas={doc.canvas}
            scale={scale}
            backgroundRef={backgroundRef}
            onCommit={onBackgroundTransform}
          />
        )}
        {(mode === 'inpaint' || mode === 'erase') && (
          <BrushSurface
            canvas={doc.canvas}
            scale={scale}
            brushSize={brushSize}
            strokes={strokes}
            strokeColor={mode === 'inpaint' ? INPAINT_STROKE_COLOR : ERASE_STROKE_COLOR}
            onStrokeEnd={onStrokeEnd}
          />
        )}
        {mode === 'lasso' && (
          <BrushSurface
            canvas={doc.canvas}
            scale={scale}
            brushSize={LASSO_PREVIEW_WIDTH}
            strokes={[]}
            strokeColor={LASSO_STROKE_COLOR}
            closedPreview
            onStrokeEnd={onStrokeEnd}
          />
        )}
      </Layer>
    </Stage>
  )
}

interface RepositionSurfaceProps {
  transform: CanvasBackgroundTransform | undefined
  src: { width: number; height: number }
  canvas: { w: number; h: number }
  scale: number
  backgroundRef: React.RefObject<Konva.Image | null>
  onCommit: (transform: CanvasBackgroundTransform) => void
}

/**
 * The full-canvas gesture surface of reposition mode: drag pans, wheel zooms toward the pointer.
 * Previews mutate the background node's crop attrs directly (never per-frame React state); the
 * doc gets ONE commit per gesture — drag end, or a settled wheel burst — so undo steps stay sane.
 */
function RepositionSurface({ transform, src, canvas, scale, backgroundRef, onCommit }: RepositionSurfaceProps) {
  const rectRef = useRef<Konva.Rect>(null)
  const gestureRef = useRef<{ startX: number; startY: number; base: CanvasBackgroundTransform } | null>(null)
  const pendingRef = useRef<CanvasBackgroundTransform | null>(null)
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const propsRef = useRef({ transform, onCommit })
  useEffect(() => {
    propsRef.current = { transform, onCommit }
  })

  // Reads refs only, so the first render's closure stays valid for the unmount cleanup.
  const flushPending = () => {
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
    if (!pendingRef.current) return
    propsRef.current.onCommit(pendingRef.current)
    pendingRef.current = null
  }

  // Leaving reposition mode unmounts this surface: flush a pending wheel commit, restore cursor.
  useEffect(() => {
    const container = rectRef.current?.getStage()?.container()
    if (container) container.style.cursor = 'grab'
    return () => {
      flushPending()
      if (container) container.style.cursor = ''
    }
  }, [])

  const current = () => pendingRef.current ?? propsRef.current.transform ?? DEFAULT_BACKGROUND_TRANSFORM

  const preview = (next: CanvasBackgroundTransform) => {
    pendingRef.current = next
    const node = backgroundRef.current
    if (!node) return
    const crop = coverCrop(src.width, src.height, canvas.w, canvas.h, next)
    node.cropX(crop.cropX)
    node.cropY(crop.cropY)
    node.cropWidth(crop.cropWidth)
    node.cropHeight(crop.cropHeight)
  }

  return (
    <Rect
      ref={rectRef}
      x={0}
      y={0}
      width={canvas.w}
      height={canvas.h}
      draggable
      // Pinned drag: the surface never moves, we only read the pointer to pan the crop window.
      dragBoundFunc={() => ({ x: 0, y: 0 })}
      onDragStart={(event) => {
        const pointer = event.target.getStage()?.getPointerPosition()
        if (!pointer) return
        gestureRef.current = { startX: pointer.x, startY: pointer.y, base: current() }
      }}
      onDragMove={(event) => {
        const gesture = gestureRef.current
        const pointer = event.target.getStage()?.getPointerPosition()
        if (!gesture || !pointer) return
        const delta = { dx: (pointer.x - gesture.startX) / scale, dy: (pointer.y - gesture.startY) / scale }
        preview(panBackground(gesture.base, delta, src, canvas))
      }}
      onDragEnd={() => {
        gestureRef.current = null
        flushPending()
      }}
      onWheel={(event) => {
        event.evt.preventDefault()
        const pointer = event.target.getStage()?.getPointerPosition()
        if (!pointer) return
        const base = current()
        const target = base.zoom * Math.exp(-event.evt.deltaY * WHEEL_ZOOM_RATE)
        preview(zoomBackgroundTo(base, target, { x: pointer.x / scale, y: pointer.y / scale }, src, canvas))
        if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
        wheelTimerRef.current = setTimeout(flushPending, WHEEL_COMMIT_DELAY_MS)
      }}
    />
  )
}
