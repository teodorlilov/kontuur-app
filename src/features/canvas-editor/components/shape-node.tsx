'use client'

import { useRef } from 'react'
import { Ellipse, Group, Line, Rect } from 'react-konva'
import type Konva from 'konva'
import type { CanvasShapeNode } from '@/types/canvas'
import { persistedRotation } from '@/lib/canvas/clamp'
import { MIN_ELEMENT_SIZE } from '@/lib/canvas/constants'
import { nodeGroupAttrs, shapeChildAttrs } from '@/lib/canvas/node-attrs'

interface ShapeNodeProps {
  node: CanvasShapeNode
  /** Locked nodes stay clickable — they just cannot be dragged. */
  locked: boolean
  /** `additive` is Shift-click: extend the selection rather than replace it. */
  onSelect: (additive: boolean) => void
  onChange: (patch: Partial<CanvasShapeNode>) => void
}

/**
 * One drawn primitive. Same Group-wrapper shape as a placed asset: the group owns identity,
 * position and the transform; the child owns the geometry. Nothing loads, so it paints immediately.
 */
export function ShapeNode({ node, locked, onSelect, onChange }: ShapeNodeProps) {
  // One ref for whichever primitive renders: Konva types each subclass separately, but every
  // operation below is on Konva.Shape, which all three are.
  const childRef = useRef<Konva.Shape>(null)
  const asShapeRef = childRef as React.Ref<never>
  const attrs = shapeChildAttrs(node)

  return (
    <Group
      {...nodeGroupAttrs(node)}
      id={node.id}
      draggable={!locked}
      onClick={(event) => onSelect(event.evt.shiftKey)}
      onTap={() => onSelect(false)}
      // Position is persisted by the stage's drag handler, which sees the whole selection.
      onTransform={(event) => {
        // Fold the group's scale into the child's size, exactly as a placed asset does — a shape
        // resized by scale would thicken its own stroke along with it.
        const group = event.target
        const child = childRef.current
        if (!child) return
        // abs(): a handle dragged past the opposite edge hands back a negative scale, which would
        // multiply the size negative and clamp it to the floor instead of resizing.
        const width = Math.max(MIN_ELEMENT_SIZE, child.width() * Math.abs(group.scaleX()))
        // A line has no height to floor: `shapeChildAttrs` draws it along the box's TOP EDGE, so
        // the box height is its stroke width and nothing else. Clamping it to 40 would silently
        // inflate the box a line is measured by — its marquee hit area, its snap edges, its
        // thumbnail — while the drawn line looked unchanged.
        const height =
          node.kind === 'line'
            ? child.height()
            : Math.max(MIN_ELEMENT_SIZE, child.height() * Math.abs(group.scaleY()))
        child.width(width)
        child.height(height)
        // An ellipse draws from its centre, so its offset has to track the new size or the node
        // walks away from its own box mid-gesture.
        if (node.kind === 'ellipse') {
          child.offsetX(-width / 2)
          child.offsetY(-height / 2)
        }
        if (node.kind === 'line') child.setAttr('points', [0, 0, width, 0])
        group.scaleX(1)
        group.scaleY(1)
      }}
      onTransformEnd={(event) => {
        const group = event.target
        onChange({
          x: group.x(),
          y: group.y(),
          width: childRef.current?.width() ?? node.width,
          height: childRef.current?.height() ?? node.height,
          rotation: persistedRotation(group.rotation()),
        })
      }}
    >
      {/* No `id` on the child: the stage matches doc nodes by walking every descendant, so a
          shared id would count this node twice in the marquee and in the snap stops. */}
      {node.kind === 'rect' && <Rect ref={asShapeRef} {...attrs} />}
      {node.kind === 'ellipse' && (
        <Ellipse ref={asShapeRef} {...attrs} radiusX={node.width / 2} radiusY={node.height / 2} />
      )}
      {node.kind === 'line' && <Line ref={asShapeRef} {...attrs} lineCap="round" />}
    </Group>
  )
}
