'use client'

import { useEffect, useRef } from 'react'
import { Circle, Line } from 'react-konva'
import type Konva from 'konva'
import { CANVAS_PAPER } from '@/lib/canvas/constants'
import { CHROME_SPRING } from '../lib/canvas-chrome'
import { clampBend } from '@/lib/canvas/text-arc'
import type { CanvasTextNode } from '@/types/canvas'
import { arcCharRenderer } from '../lib/text-arc-renderer'

/** How far the handle travels for a full half-turn, in authoring px. */
const DRAG_RANGE = 260
/** Gap between the text's box and the handle's resting place. */
const HANDLE_GAP = 34

interface ArcHandleProps {
  node: CanvasTextNode
  /** View scale, so the handle keeps one on-screen size at every zoom. */
  scale: number
  onCommit: (bend: number) => void
}

/**
 * Drag the curve instead of pushing a number.
 *
 * Follows the reposition surface's contract: the drag mutates the live Konva node directly and the
 * doc hears about it exactly once, at the end. Committing per frame would put ~60 entries into a
 * 50-step history and make one gesture impossible to undo.
 */
export function ArcHandle({ node, scale, onCommit }: ArcHandleProps) {
  const handleRef = useRef<Konva.Circle>(null)
  // The bend the pointer is currently showing. A ref, not state: the preview is drawn by Konva, and
  // a React render per frame is the cost this whole pattern exists to avoid.
  const previewRef = useRef<number | null>(null)
  // The screen x the drag started at. Captured rather than read from `this` inside dragBoundFunc:
  // that syntax makes the React compiler skip the whole component, and a bound function cannot see
  // the ref anyway.
  const axisXRef = useRef(0)

  // An arc only ever draws on ONE line, so the box height is the line box — no measurement needed,
  // and no dependency on the shared measurer from inside a Konva child.
  const boxHeight = node.fontSize * node.lineHeight
  // Where a bend of zero puts the handle. Everything else is measured from here.
  const zeroY = node.y + boxHeight + HANDLE_GAP
  const centreX = node.x + node.width / 2
  /** The handle's place for a given bend — and the inverse of what a drag reads back out. */
  const yForBend = (bend: number) => zeroY - bend * DRAG_RANGE
  // Seeded from the node's CURRENT bend, not from zero. Resting a bent node's handle at zero would
  // make the first touch of a drag read bend 0 and snap the arc flat before the pointer moved.
  const restY = yForBend(node.arcBend ?? 0)

  // A drag interrupted by anything — Escape, a slide switch, the editor closing — must not strand
  // the preview on the canvas with nothing in the doc. Flushing rather than reverting matches the
  // house pattern: the user saw that bend, so it is the one to keep.
  useEffect(
    () => () => {
      if (previewRef.current !== null) onCommit(previewRef.current)
    },
    [onCommit]
  )

  /** Paint a candidate bend onto the live text without touching the doc. */
  const preview = (bend: number) => {
    // Found by id rather than threaded down as a ref: TextNode owns its own Text, and reaching for
    // it here keeps this handle mountable beside any selected node without changing that component.
    //
    // `editor-stage.tsx` bans the '#id' selector, and this is the exception rather than a lapse:
    // the rule is about an id the caller has CSS-ESCAPED, which Konva then compares verbatim and
    // never matches. `_isMatch` is a plain string compare, so an unescaped id — which is all this
    // passes — matches exactly. Escape this and it silently stops finding anything.
    const layer = handleRef.current?.getLayer()
    const text = layer?.findOne<Konva.Group>(`#${node.id}`)?.findOne<Konva.Text>('Text')
    if (!text) return
    previewRef.current = bend
    // A NEW closure every frame, on purpose: Konva's `_setAttr` early-returns when the value is
    // identical, and a function fails its `isObject` test — so re-setting the same reference would
    // be silently dropped and the canvas would freeze mid-drag.
    text.charRenderFunc(arcCharRenderer({ ...node, arcBend: bend }) ?? null)
    layer?.batchDraw()
  }

  return (
    <>
      {/* A hairline back to the text, so the handle reads as attached to something. */}
      <Line
        points={[centreX, node.y + boxHeight, centreX, restY]}
        stroke={CHROME_SPRING}
        strokeWidth={1 / scale}
        dash={[3 / scale, 3 / scale]}
        listening={false}
      />
      <Circle
        ref={handleRef}
        x={centreX}
        y={restY}
        radius={7 / scale}
        fill={CANVAS_PAPER}
        stroke={CHROME_SPRING}
        strokeWidth={2 / scale}
        draggable
        // Vertical only: the arc is symmetric about the line's middle, so sideways movement has
        // nothing to say. Pinned here rather than corrected afterwards, so the handle stays under
        // the pointer instead of sliding out from under it.
        dragBoundFunc={(pos) => ({ x: axisXRef.current, y: pos.y })}
        onDragStart={() => {
          axisXRef.current = handleRef.current?.getAbsolutePosition().x ?? 0
        }}
        onDragMove={(event) => {
          // Up is a rise: dragging the handle away from the text lifts the middle into an arch.
          const raw = (zeroY - event.target.y()) / DRAG_RANGE
          preview(clampBend(raw, node.width, node.fontSize))
        }}
        onDragEnd={(event) => {
          const bend = previewRef.current ?? node.arcBend ?? 0
          previewRef.current = null
          // Snapped to the bend actually committed, which is not where the pointer stopped once the
          // clamp has had its say — otherwise the handle drifts further from the curve on every
          // drag that hits the limit.
          event.target.position({ x: centreX, y: yForBend(bend) })
          onCommit(bend)
        }}
      />
    </>
  )
}
