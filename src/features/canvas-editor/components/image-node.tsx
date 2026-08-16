'use client'

import { useEffect, useRef } from 'react'
import { Group, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import type { CanvasImageNode } from '@/types/canvas'
import { persistedRotation } from '@/lib/canvas/clamp'
import { MIN_ELEMENT_SIZE } from '@/lib/canvas/constants'
import { imageBitmapAttrs, nodeGroupAttrs } from '@/lib/canvas/node-attrs'
import { useCrossOriginImage } from '../hooks/use-cross-origin-image'

interface ImageNodeProps {
  node: CanvasImageNode
  /** Locked nodes stay clickable — they just cannot be dragged. */
  locked: boolean
  /** `additive` is Shift-click: extend the selection rather than replace it. */
  onSelect: (additive: boolean) => void
  onChange: (patch: Partial<CanvasImageNode>) => void
  /** Fires when the Konva node exists (asset loaded) — the Transformer re-attaches on it. */
  onNodeReady: () => void
}

/**
 * One placed asset: draggable, corner-resizable (scale folds into size), rotatable, mirrorable.
 *
 * The Group owns identity, position and the transform; the bitmap child owns the size and the
 * mirror. That split is what lets a flipped node be resized — see `nodeGroupAttrs` for why a
 * mirror can never sit on the node the Transformer decomposes onto.
 */
export function ImageNode({ node, locked, onSelect, onChange, onNodeReady }: ImageNodeProps) {
  // Progressive: the node appears when its asset loads; export loads its own copy and fails loud.
  const image = useCrossOriginImage(node.src.publicUrl)
  const bitmapRef = useRef<Konva.Image>(null)

  // A freshly added node is selected BEFORE its Konva node exists — signal so selection can attach.
  useEffect(() => {
    if (image) onNodeReady()
    // The parent memoizes onNodeReady; depending on `image` alone avoids a signal-per-render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  if (!image) return null
  return (
    <Group
      {...nodeGroupAttrs(node)}
      id={node.id}
      draggable={!locked}
      onClick={(event) => onSelect(event.evt.shiftKey)}
      onTap={() => onSelect(false)}
      // Position is persisted by the stage's drag handler, which sees the whole selection.
      onTransform={(event) => {
        // Fold the group's scale into the child's size DURING transform — keeps the bitmap sharp
        // instead of stretched, and keeps the group at scale 1 so the Transformer never has to
        // decompose anything but a plain rotation+translation.
        const group = event.target
        const bitmap = bitmapRef.current
        if (!bitmap) return
        // abs(): the child's own scale carries the mirror. Multiplying by a signed scale would
        // turn a flipped node's size negative on the first resize and clamp it to the floor.
        //
        // The floor is per-axis, which would break the aspect lock if it were ever the binding
        // constraint — it is not: the stage's boundBoxFunc rejects the whole box before Konva
        // applies it, so this is a last-resort guard rather than the live clamp. Carried over
        // unchanged from the pre-Group version deliberately.
        const width = Math.max(MIN_ELEMENT_SIZE, bitmap.width() * Math.abs(group.scaleX()))
        const height = Math.max(MIN_ELEMENT_SIZE, bitmap.height() * Math.abs(group.scaleY()))
        bitmap.width(width)
        bitmap.height(height)
        // The mirror pivots on the far edge, so it has to follow the new size or the node jumps.
        if (node.flipX) bitmap.offsetX(width)
        if (node.flipY) bitmap.offsetY(height)
        group.scaleX(1)
        group.scaleY(1)
      }}
      onTransformEnd={(event) => {
        const group = event.target
        onChange({
          x: group.x(),
          y: group.y(),
          width: bitmapRef.current?.width() ?? node.width,
          height: bitmapRef.current?.height() ?? node.height,
          rotation: persistedRotation(group.rotation()),
        })
      }}
    >
      {/* No `id` on the child: the stage matches doc nodes by walking every descendant, so a
          shared id would count this node twice in the marquee and in the snap stops. */}
      <KonvaImage ref={bitmapRef} {...imageBitmapAttrs(node)} image={image} />
    </Group>
  )
}
