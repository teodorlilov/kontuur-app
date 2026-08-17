'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import type { CanvasTextNode } from '@/types/canvas'

/**
 * The standard Konva inline-edit trick: on double-click the Text node hides and an absolutely
 * positioned textarea with matching metrics appears over it. Blur commits, Escape cancels.
 * Committed edits set `textOverridden` so recompose keeps the user's wording.
 */
export function useInlineTextEdit(
  onCommit: (id: string, text: string) => void,
  /**
   * What the editor OPENS with, when that is not simply the node's own text.
   *
   * A hero lockup holds one sentence in two boxes, and on the canvas the bigger one looks like the
   * whole headline — so retyping either half left the other half's leftovers glued to the result.
   * Handing the editor the whole sentence removes the fragment rather than warning about it.
   */
  initialText?: (node: CanvasTextNode) => string
) {
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
      const opened = initialText?.(node) ?? node.text
      const textarea = document.createElement('textarea')
      textarea.value = opened
      applyTextareaStyle(textarea, node, pivot, text.height() * scale, containerRect, scale)
      document.body.appendChild(textarea)
      setEditingId(node.id)

      const finish = (commit: boolean) => {
        cleanupRef.current = null
        const value = textarea.value
        textarea.remove()
        setEditingId(null)
        // Compared against what was OPENED, not the node's own text: on a split headline those
        // differ, and comparing to the node would commit on every open.
        if (commit && value !== opened) onCommit(node.id, value)
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
    [onCommit, initialText]
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
    // The textarea sits ON the canvas text, so tracking has to match or the glyphs the user is
    // typing sit beside the ones they are replacing. CSS adds a trailing advance after the last
    // glyph exactly as Konva does, so the two stay aligned.
    letterSpacing: `${(node.letterSpacing ?? 0) * scale}px`,
    fontStyle: node.italic ? 'italic' : 'normal',
    fontWeight: String(node.fontWeight),
    lineHeight: String(node.lineHeight),
    textAlign: node.align,
    color: node.fill,
    background: 'rgba(255, 255, 255, 0.72)',
    border: '1px dashed var(--line2)',
    outline: 'none',
    resize: 'none',
    // Scrolls rather than clips: opened on a split headline the box holds the WHOLE sentence, which
    // is taller than the poster word whose metrics it is wearing.
    overflow: 'auto',
    margin: '0',
    padding: '0',
    zIndex: '300',
  })
}
