'use client'

import { useEffect } from 'react'
import { Image as KonvaImage } from 'react-konva'
import type { CanvasElement } from '@/types/canvas'
import { MIN_ELEMENT_SIZE } from '@/lib/canvas/constants'
import { elementNodeAttrs } from '@/lib/canvas/node-attrs'
import { useCrossOriginImage } from '../hooks/use-cross-origin-image'
import { dragBoundFor, persistedRotation } from '../lib/node-interaction'

interface ElementNodeProps {
  element: CanvasElement
  canvas: { w: number; h: number }
  stageScale: number
  onSelect: () => void
  onChange: (patch: Partial<CanvasElement>) => void
  /** Fires when the Konva node exists (asset loaded) — the Transformer re-attaches on it. */
  onNodeReady: () => void
}

/** One placed asset: draggable, corner-resizable (scale folds into size), rotatable. */
export function ElementNode({
  element,
  canvas,
  stageScale,
  onSelect,
  onChange,
  onNodeReady,
}: ElementNodeProps) {
  // Progressive: the node appears when its asset loads; export loads its own copy and fails loud.
  const image = useCrossOriginImage(element.src.publicUrl)

  // A freshly added element is selected BEFORE its node exists — signal so selection can attach.
  useEffect(() => {
    if (image) onNodeReady()
    // The parent memoizes onNodeReady; depending on `image` alone avoids a signal-per-render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  if (!image) return null
  return (
    <KonvaImage
      {...elementNodeAttrs(element)}
      image={image}
      id={element.id}
      draggable
      dragBoundFunc={dragBoundFor(element, canvas, stageScale)}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onSelect}
      onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })}
      onTransform={(event) => {
        // Fold scale into size DURING transform — keeps the bitmap sharp instead of stretched.
        const node = event.target
        node.width(Math.max(MIN_ELEMENT_SIZE, node.width() * node.scaleX()))
        node.height(Math.max(MIN_ELEMENT_SIZE, node.height() * node.scaleY()))
        node.scaleX(1)
        node.scaleY(1)
      }}
      onTransformEnd={(event) => {
        const node = event.target
        onChange({
          x: node.x(),
          y: node.y(),
          width: node.width(),
          height: node.height(),
          rotation: persistedRotation(node.rotation()),
        })
      }}
    />
  )
}
