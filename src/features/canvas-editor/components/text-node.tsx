'use client'

import { useRef } from 'react'
import { Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { CanvasTextLayer } from '@/types/canvas'
import { MIN_TEXT_LAYER_WIDTH } from '@/lib/canvas/constants'
import { textGroupAttrs, textNodeAttrs } from '@/lib/canvas/node-attrs'
import { highlightBands } from '../lib/measure-fit'
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

/**
 * One editable text layer: a group of marker-highlight bands + glyphs so decoration tracks
 * drag/rotate live. The group owns position/rotation and the Transformer; the text child sits at
 * the group origin. Side handles resize by width (scaleX folds into the CHILD's width mid-
 * gesture); dblclick on the glyphs opens the inline editor.
 */
export function TextNode({
  layer,
  canvas,
  stageScale,
  hidden,
  onSelect,
  onChange,
  onStartEdit,
}: TextNodeProps) {
  const textRef = useRef<Konva.Text>(null)
  return (
    <Group
      {...textGroupAttrs(layer)}
      id={layer.id}
      visible={!hidden}
      draggable
      dragBoundFunc={dragBoundFor(layer, canvas, stageScale)}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onSelect}
      onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })}
      onTransform={(event) => {
        // Fold scaleX into the child's width DURING transform (not just at the end) — otherwise
        // glyphs squish; the group's scale resets so bands and text never stretch.
        const group = event.target
        const text = textRef.current
        if (!text) return
        text.width(Math.max(MIN_TEXT_LAYER_WIDTH, text.width() * group.scaleX()))
        group.scaleX(1)
        group.scaleY(1)
      }}
      onTransformEnd={(event) => {
        const group = event.target
        onChange({
          x: group.x(),
          y: group.y(),
          width: textRef.current?.width() ?? layer.width,
          rotation: persistedRotation(group.rotation()),
        })
      }}
    >
      {highlightBands(layer).map((band, index) => (
        <Rect key={index} {...band} />
      ))}
      <Text
        ref={textRef}
        {...textNodeAttrs(layer)}
        onDblClick={(event) => onStartEdit(event.target as Konva.Text)}
        onDblTap={(event) => onStartEdit(event.target as Konva.Text)}
      />
    </Group>
  )
}
