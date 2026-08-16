'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import type { CanvasTextNode } from '@/types/canvas'

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
    (node: CanvasTextNode, text: Konva.Text, scale: number) => {
      cleanupRef.current?.()
      const stage = text.getStage()
      if (!stage) return

      const containerRect = stage.container().getBoundingClientRect()
      // Anchor at the text's top-left PIVOT (rotation-independent), not getClientRect() — that
      // returns the rotation-expanded bounding box and would misplace a rotated overlay.
      const pivot = text.absolutePosition()
      const textarea = document.createElement('textarea')
      textarea.value = node.text
      applyTextareaStyle(textarea, node, pivot, text.height() * scale, containerRect, scale)
      document.body.appendChild(textarea)
      setEditingId(node.id)

      const finish = (commit: boolean) => {
        cleanupRef.current = null
        const value = textarea.value
        textarea.remove()
        setEditingId(null)
        if (commit && value !== node.text) onCommit(node.id, value)
      }
      cleanupRef.current = () => finish(false)

      textarea.addEventListener('blur', () => finish(true))
      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') finish(false)
        event.stopPropagation() // editor-level shortcuts (undo, delete) stay suspended
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
  node: CanvasTextNode,
  pivot: { x: number; y: number },
  textHeight: number,
  containerRect: DOMRect,
  scale: number
): void {
  Object.assign(textarea.style, {
    position: 'absolute',
    top: `${containerRect.top + window.scrollY + pivot.y}px`,
    left: `${containerRect.left + window.scrollX + pivot.x}px`,
    width: `${node.width * scale}px`,
    minHeight: `${textHeight + 8}px`,
    // Mirror the node's rotation around the same top-left pivot so the overlay sits ON the text.
    transform: `rotate(${node.rotation ?? 0}deg)`,
    transformOrigin: 'left top',
    // Display-only capitals, exactly like the node — the committed text keeps its casing.
    textTransform: node.uppercase ? 'uppercase' : 'none',
    fontFamily: `"${node.fontFamily}", sans-serif`,
    fontSize: `${node.fontSize * scale}px`,
    fontStyle: node.italic ? 'italic' : 'normal',
    fontWeight: String(node.fontWeight),
    lineHeight: String(node.lineHeight),
    textAlign: node.align,
    color: node.fill,
    background: 'rgba(255, 255, 255, 0.72)',
    border: '1px dashed var(--line2)',
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    margin: '0',
    padding: '0',
    zIndex: '300',
  })
}
