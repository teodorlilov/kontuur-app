'use client'

import { useEffect, useRef } from 'react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { CanvasBackgroundTransform, CanvasDoc, CanvasTextLayer } from '@/types/canvas'
import { MIN_TEXT_LAYER_WIDTH } from '@/lib/canvas/constants'
import { coverCrop } from '@/lib/canvas/cover-crop'
import { backgroundNodeAttrs, scrimNodeAttrs } from '@/lib/canvas/node-attrs'
import {
  DEFAULT_BACKGROUND_TRANSFORM,
  panBackground,
  zoomBackgroundTo,
} from '@/lib/canvas/reposition'
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
  repositionMode: boolean
  onSelect: (id: string | null) => void
  onLayerChange: (id: string, patch: Partial<CanvasTextLayer>) => void
  onStartEdit: (layer: CanvasTextLayer, node: Konva.Text) => void
  onBackgroundTransform: (transform: CanvasBackgroundTransform) => void
}

/** The live canvas: background (cover-cropped) → scrim → text layers → selection Transformer. */
export function EditorStage({
  doc,
  backgroundImage,
  scale,
  selectedId,
  editingId,
  repositionMode,
  onSelect,
  onLayerChange,
  onStartEdit,
  onBackgroundTransform,
}: EditorStageProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const backgroundRef = useRef<Konva.Image>(null)

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    const node = selectedId && selectedId !== editingId ? stage.findOne(`#${CSS.escape(selectedId)}`) : null
    transformer.nodes(node ? [node] : [])
  }, [selectedId, editingId, doc.layers])

  const scrim = scrimNodeAttrs(doc.scrim, doc.canvas)
  const src = { width: backgroundImage.naturalWidth, height: backgroundImage.naturalHeight }

  return (
    <Stage
      ref={stageRef}
      width={doc.canvas.w * scale}
      height={doc.canvas.h * scale}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(event) => {
        if (event.target === event.target.getStage()) onSelect(null)
      }}
      onTouchStart={(event) => {
        if (event.target === event.target.getStage()) onSelect(null)
      }}
    >
      <Layer>
        <KonvaImage
          ref={backgroundRef}
          image={backgroundImage}
          listening={false}
          {...backgroundNodeAttrs(src, doc.canvas, doc.backgroundTransform)}
        />
        {/* Dim + lock everything above the background while it is being repositioned. */}
        <Group opacity={repositionMode ? 0.35 : 1} listening={!repositionMode}>
          {scrim && <Rect listening={false} {...scrim} />}
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
        </Group>
        <Transformer
          ref={transformerRef}
          enabledAnchors={['middle-left', 'middle-right']}
          rotateEnabled
          rotationSnaps={[-90, -45, 0, 45, 90, 180]}
          rotationSnapTolerance={6}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < MIN_TEXT_LAYER_WIDTH * scale ? oldBox : newBox)}
        />
        {repositionMode && (
          <RepositionSurface
            transform={doc.backgroundTransform}
            src={src}
            canvas={doc.canvas}
            scale={scale}
            backgroundRef={backgroundRef}
            onCommit={onBackgroundTransform}
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
