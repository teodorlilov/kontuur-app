'use client'

import { useEffect, useRef } from 'react'
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { CanvasDoc, CanvasTextLayer } from '@/types/canvas'
import { MIN_TEXT_LAYER_WIDTH } from '@/lib/canvas/constants'
import { backgroundNodeAttrs, scrimNodeAttrs } from '@/lib/canvas/node-attrs'
import { TextNode } from './text-node'

interface EditorStageProps {
  doc: CanvasDoc
  backgroundImage: HTMLImageElement
  scale: number
  selectedId: string | null
  editingId: string | null
  onSelect: (id: string | null) => void
  onLayerChange: (id: string, patch: Partial<CanvasTextLayer>) => void
  onStartEdit: (layer: CanvasTextLayer, node: Konva.Text) => void
}

/** The live canvas: background (cover-cropped) → scrim → text layers → selection Transformer. */
export function EditorStage({
  doc,
  backgroundImage,
  scale,
  selectedId,
  editingId,
  onSelect,
  onLayerChange,
  onStartEdit,
}: EditorStageProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    const node = selectedId && selectedId !== editingId ? stage.findOne(`#${CSS.escape(selectedId)}`) : null
    transformer.nodes(node ? [node] : [])
  }, [selectedId, editingId, doc.layers])

  const scrim = scrimNodeAttrs(doc.scrim, doc.canvas)

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
          image={backgroundImage}
          listening={false}
          {...backgroundNodeAttrs(
            { width: backgroundImage.naturalWidth, height: backgroundImage.naturalHeight },
            doc.canvas
          )}
        />
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
        <Transformer
          ref={transformerRef}
          enabledAnchors={['middle-left', 'middle-right']}
          rotateEnabled={false}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < MIN_TEXT_LAYER_WIDTH * scale ? oldBox : newBox)}
        />
      </Layer>
    </Stage>
  )
}
