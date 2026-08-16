'use client'

import { useMemo, useRef } from 'react'
import { Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { CanvasTextNode } from '@/types/canvas'
import { persistedRotation } from '@/lib/canvas/clamp'
import { MIN_TEXT_LAYER_WIDTH } from '@/lib/canvas/constants'
import { textGroupAttrs, textNodeAttrs } from '@/lib/canvas/node-attrs'
import { arcCharRenderer } from '../lib/text-arc-renderer'
import { highlightBands } from '../lib/measure-fit'

interface TextNodeProps {
  node: CanvasTextNode
  /** True while the inline textarea is open over this node — the glyphs step aside for it. Not
   *  the doc's `hidden` flag, which the stage answers by not rendering the node at all. */
  editing: boolean
  /** Locked nodes stay clickable — they just cannot be dragged. */
  locked: boolean
  /** `additive` is Shift-click: extend the selection rather than replace it. */
  onSelect: (additive: boolean) => void
  onChange: (patch: Partial<CanvasTextNode>) => void
  onStartEdit: (text: Konva.Text) => void
}

/**
 * One editable text node: a group of marker-highlight bands + glyphs so decoration tracks
 * drag/rotate live. The group owns position/rotation and the Transformer; the text child sits at
 * the group origin. Side handles resize by width (scaleX folds into the CHILD's width mid-
 * gesture); dblclick on the glyphs opens the inline editor.
 */
export function TextNode({
  node,
  editing,
  locked,
  onSelect,
  onChange,
  onStartEdit,
}: TextNodeProps) {
  const textRef = useRef<Konva.Text>(null)
  const charRenderer = useMemo(() => arcCharRenderer(node) ?? null, [node])
  return (
    <Group
      {...textGroupAttrs(node)}
      id={node.id}
      visible={!editing}
      draggable={!locked}
      onClick={(event) => onSelect(event.evt.shiftKey)}
      onTap={() => onSelect(false)}
      // Position is persisted by the stage's drag handler, which sees the whole selection.
      onTransform={(event) => {
        // Fold scaleX into the child's width DURING transform (not just at the end) — otherwise
        // glyphs squish; the group's scale resets so bands and text never stretch.
        const group = event.target
        const text = textRef.current
        if (!text) return
        // abs(): a side handle dragged past the opposite edge hands back a negative scale, which
        // would multiply the width negative and clamp it to the floor instead of re-wrapping.
        text.width(Math.max(MIN_TEXT_LAYER_WIDTH, text.width() * Math.abs(group.scaleX())))
        group.scaleX(1)
        group.scaleY(1)
      }}
      onTransformEnd={(event) => {
        const group = event.target
        onChange({
          x: group.x(),
          y: group.y(),
          width: textRef.current?.width() ?? node.width,
          rotation: persistedRotation(group.rotation()),
        })
      }}
    >
      {highlightBands(node).map((band, index) => (
        <Rect key={index} {...band} />
      ))}
      <Text
        ref={textRef}
        {...textNodeAttrs(node)}
        // Memoized: react-konva diffs props by reference, so a fresh arrow here would re-set the
        // attr and redraw the layer on every render of the stage.
        charRenderFunc={charRenderer}
        onDblClick={(event) => onStartEdit(event.target as Konva.Text)}
        onDblTap={(event) => onStartEdit(event.target as Konva.Text)}
      />
    </Group>
  )
}
