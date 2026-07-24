'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import type { CanvasTextLayer } from '@/types/canvas'

/**
 * The standard Konva inline-edit trick: on double-click the Text node hides and an absolutely
 * positioned textarea with matching metrics appears over it. Blur commits, Escape cancels.
 * Committed edits set `textOverridden` so recompose keeps the user's wording.
 */
export function useInlineTextEdit(onCommit: (id: string, text: string) => void) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const startEdit = useCallback(
    (layer: CanvasTextLayer, node: Konva.Text, scale: number) => {
      cleanupRef.current?.()
      const stage = node.getStage()
      if (!stage) return

      const containerRect = stage.container().getBoundingClientRect()
      // Anchor at the node's top-left PIVOT (rotation-independent), not getClientRect() — that
      // returns the rotation-expanded bounding box and would misplace a rotated overlay.
      const pivot = node.absolutePosition()
      const textarea = document.createElement('textarea')
      textarea.value = layer.text
      applyTextareaStyle(textarea, layer, pivot, node.height() * scale, containerRect, scale)
      document.body.appendChild(textarea)
      setEditingId(layer.id)

      const finish = (commit: boolean) => {
        cleanupRef.current = null
        const value = textarea.value
        textarea.remove()
        setEditingId(null)
        if (commit && value !== layer.text) onCommit(layer.id, value)
      }
      cleanupRef.current = () => finish(false)

      textarea.addEventListener('blur', () => finish(true))
      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') finish(false)
        event.stopPropagation() // editor-level shortcuts (undo, delete-layer) stay suspended
      })
      textarea.focus()
      textarea.select()
    },
    [onCommit]
  )

  return { editingId, startEdit }
}

function applyTextareaStyle(
  textarea: HTMLTextAreaElement,
  layer: CanvasTextLayer,
  pivot: { x: number; y: number },
  nodeHeight: number,
  containerRect: DOMRect,
  scale: number
): void {
  Object.assign(textarea.style, {
    position: 'absolute',
    top: `${containerRect.top + window.scrollY + pivot.y}px`,
    left: `${containerRect.left + window.scrollX + pivot.x}px`,
    width: `${layer.width * scale}px`,
    minHeight: `${nodeHeight + 8}px`,
    // Mirror the node's rotation around the same top-left pivot so the overlay sits ON the text.
    transform: `rotate(${layer.rotation ?? 0}deg)`,
    transformOrigin: 'left top',
    fontFamily: `"${layer.fontFamily}", sans-serif`,
    fontSize: `${layer.fontSize * scale}px`,
    fontWeight: String(layer.fontWeight),
    lineHeight: String(layer.lineHeight),
    textAlign: layer.align,
    color: layer.fill,
    background: 'rgba(255, 255, 255, 0.72)',
    border: '1px dashed var(--color-border-3)',
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    margin: '0',
    padding: '0',
    zIndex: '300',
  })
}
