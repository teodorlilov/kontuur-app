'use client'

import { useEffect, useRef } from 'react'
import { Group, Line, Rect } from 'react-konva'
import type Konva from 'konva'
import type { BrushStroke } from '../types'

export const INPAINT_STROKE_COLOR = 'rgba(214, 69, 69, 0.55)'
export const ERASE_STROKE_COLOR = 'rgba(37, 99, 235, 0.5)'
export const LASSO_STROKE_COLOR = 'rgba(15,21,18, 0.9)'
/** The thin outline width of the lasso's closed preview — the loop is a path, not paint. */
export const LASSO_PREVIEW_WIDTH = 2

interface BrushSurfaceProps {
  canvas: { w: number; h: number }
  /** False while Space is held, so the drag pans the view instead of painting. */
  interactive: boolean
  brushSize: number
  strokes: BrushStroke[]
  strokeColor: string
  /** Lasso-style preview: a thin closed dashed outline instead of thick paint strokes. */
  closedPreview?: boolean
  onStrokeEnd: (stroke: BrushStroke) => void
}

/**
 * Stroke capture shared by the inpaint, eraser and lasso modes: committed strokes render from
 * props; the ACTIVE stroke mutates one Line node imperatively per pointer move — React commits
 * once per finished stroke.
 */
export function BrushSurface({
  canvas,
  interactive,
  brushSize,
  strokes,
  strokeColor,
  closedPreview,
  onStrokeEnd,
}: BrushSurfaceProps) {
  const rectRef = useRef<Konva.Rect>(null)
  const activeLineRef = useRef<Konva.Line>(null)
  const pointsRef = useRef<number[]>([])

  useEffect(() => {
    const container = rectRef.current?.getStage()?.container()
    if (container) container.style.cursor = 'crosshair'
    return () => {
      if (container) container.style.cursor = ''
    }
  }, [])

  // Relative to the surface itself, so strokes land where they were painted at any zoom or pan —
  // the stage transform is already divided out.
  const pointerPos = (node: Konva.Node): { x: number; y: number } | null =>
    node.getRelativePointerPosition()

  return (
    <Group>
      {strokes.map((stroke, index) => (
        <Line
          key={index}
          points={stroke.points}
          stroke={strokeColor}
          strokeWidth={stroke.size}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      ))}
      <Line
        ref={activeLineRef}
        points={[]}
        stroke={strokeColor}
        lineCap="round"
        lineJoin="round"
        listening={false}
        {...(closedPreview ? { closed: true, dash: [10, 6], fill: 'rgba(15,21,18, 0.08)' } : {})}
      />
      <Rect
        ref={rectRef}
        x={0}
        y={0}
        width={canvas.w}
        height={canvas.h}
        listening={interactive}
        draggable={interactive}
        // Pinned drag: the surface never moves, we only read the pointer to draw the stroke.
        // dragBoundFunc returns an ABSOLUTE position and the stage carries the view transform, so
        // the canvas origin is the stage's own position — not (0, 0).
        dragBoundFunc={() => rectRef.current?.getStage()?.position() ?? { x: 0, y: 0 }}
        onDragStart={(event) => {
          const point = pointerPos(event.target)
          if (!point) return
          pointsRef.current = [point.x, point.y]
          activeLineRef.current?.strokeWidth(closedPreview ? LASSO_PREVIEW_WIDTH : brushSize)
          activeLineRef.current?.points(pointsRef.current)
        }}
        onDragMove={(event) => {
          const point = pointerPos(event.target)
          if (!point) return
          pointsRef.current.push(point.x, point.y)
          activeLineRef.current?.points(pointsRef.current)
        }}
        onDragEnd={() => {
          if (pointsRef.current.length >= 2) {
            // A click with no movement still marks a dot — nudge a second point so the line draws.
            const points =
              pointsRef.current.length === 2
                ? [...pointsRef.current, pointsRef.current[0]! + 0.01, pointsRef.current[1]!]
                : [...pointsRef.current]
            onStrokeEnd({ points, size: brushSize })
          }
          pointsRef.current = []
          activeLineRef.current?.points([])
        }}
      />
    </Group>
  )
}
