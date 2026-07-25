'use client'

import { Text } from 'react-konva'
import type Konva from 'konva'
import type { CanvasTextLayer } from '@/types/canvas'
import { MIN_TEXT_LAYER_WIDTH } from '@/lib/canvas/constants'
import { textNodeAttrs } from '@/lib/canvas/node-attrs'
import { dragBoundFor, persistedRotation } from '../lib/node-interaction'

interface TextNodeProps {
  layer: CanvasTextLayer
  canvas: { w: number; h: number }
  stageScale: number
  hidden: boolean
  onSelect: () => void
  onChange: (patch: Partial<CanvasTextLayer>) => void
  onStartEdit: (node: Konva.Text) => void
}

/** One editable text layer: draggable, side-handle resizable (width folds scaleX), dblclick to edit. */
export function TextNode({ layer, canvas, stageScale, hidden, onSelect, onChange, onStartEdit }: TextNodeProps) {
  return (
    <Text
      {...textNodeAttrs(layer)}
      id={layer.id}
      visible={!hidden}
      draggable
      dragBoundFunc={dragBoundFor(layer, canvas, stageScale)}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onSelect}
      onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })}
      onTransform={(event) => {
        // Fold scaleX into width DURING transform (not just at the end) — otherwise glyphs squish.
        const node = event.target as Konva.Text
        node.width(Math.max(MIN_TEXT_LAYER_WIDTH, node.width() * node.scaleX()))
        node.scaleX(1)
        node.scaleY(1)
      }}
      onTransformEnd={(event) => {
        const node = event.target as Konva.Text
        onChange({
          x: node.x(),
          y: node.y(),
          width: node.width(),
          rotation: persistedRotation(node.rotation()),
        })
      }}
      onDblClick={(event) => onStartEdit(event.target as Konva.Text)}
      onDblTap={(event) => onStartEdit(event.target as Konva.Text)}
    />
  )
}
