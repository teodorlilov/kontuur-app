'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { computeFit, FIT_SCALE, MIN_FONT_SIZE } from '@/lib/canvas/autofit'
import type { CanvasTextNode } from '@/types/canvas'

/** Breathing room under the node's own text height, so the caret's line is never clipped. */
const BOX_PADDING = 8

/**
 * The standard Konva inline-edit trick: on double-click the Text node hides and an absolutely
 * positioned textarea appears over it. Blur commits, Escape cancels. Committed edits set
 * `textOverridden` so recompose keeps the user's wording.
 *
 * The overlay wears the node's metrics so the glyphs land where the ones they replace were — except
 * where `initialText` hands it a longer string than the node holds, which is not a WYSIWYG overlay
 * any more and is fitted to its box instead. See `fitOpenedText`.
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
      const boxHeight = text.height() * scale + BOX_PADDING
      const textarea = document.createElement('textarea')
      textarea.value = opened
      applyTextareaStyle(textarea, node, pivot, boxHeight, containerRect, scale)
      document.body.appendChild(textarea)
      if (opened !== node.text) fitOpenedText(textarea, node, boxHeight, scale)
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
      // AFTER select(), which scrolls a textarea to the end of the selection. That is what put the
      // caret — and the view — at the last line of a sentence whose first word the user had just
      // double-clicked. `fitOpenedText` usually leaves nothing to scroll; this covers the case where
      // it bottomed out at MIN_FONT_SIZE and the text still overflows.
      textarea.select()
      textarea.scrollTop = 0
    },
    [onCommit, initialText]
  )

  return { editingId, startEdit }
}

function applyTextareaStyle(
  textarea: HTMLTextAreaElement,
  node: CanvasTextNode,
  pivot: { x: number; y: number },
  boxHeight: number,
  containerRect: DOMRect,
  scale: number
): void {
  Object.assign(textarea.style, {
    position: 'absolute',
    top: `${containerRect.top + window.scrollY + pivot.y}px`,
    left: `${containerRect.left + window.scrollX + pivot.x}px`,
    width: `${node.width * scale}px`,
    minHeight: `${boxHeight}px`,
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
    // No plate behind the glyphs. A translucent white one used to sit here, and what it bought was
    // a lie: `withContrast` repaints fills on exactly two paths (applying a lockup, changing the
    // art), so a node's colour can sit below the contrast floor against the picture underneath it —
    // and the plate made that unreadable pair look fine for as long as the editor was open. Editing
    // now shows what the slide shows, and `lowContrastLabels` is what says the type cannot be read.
    background: 'transparent',
    // The only thing left marking the edit box, now that the plate is gone.
    border: '1px dashed var(--line2)',
    outline: 'none',
    resize: 'none',
    // Scrolls rather than clips, for the one case `fitOpenedText` cannot solve: a sentence long
    // enough to still overflow at MIN_FONT_SIZE. Clipping there would hide words with nothing to
    // say so.
    overflow: 'auto',
    margin: '0',
    padding: '0',
    zIndex: '300',
  })
}

/**
 * Shrink the overlay's type until the text it was OPENED with fits the box the node occupies.
 *
 * Only runs when the editor is holding something other than the node's own text, which today means
 * a split headline: the box wears a poster word's metrics and is handed the whole sentence. Sized
 * from the word alone that box held roughly a fifth of its content, so opening one showed a fragment
 * from the middle of the sentence — the reported symptom was a slide showing one word and an editor
 * revealing several lines of unrelated-looking text.
 *
 * DISPLAY-ONLY. The node's own `fontSize` is never written, so the slide snaps back to poster scale
 * the moment the edit commits — and `setHeadline` re-splits the sentence across hero and headline
 * exactly as before.
 *
 * Measured against the textarea itself rather than through the Konva measurer in `measure-fit.ts`:
 * this is the element that will actually lay the glyphs out, and its wrapping is the browser's, not
 * Konva's. The step ratio and floor are shared with the canvas fitter so the two cannot disagree.
 */
function fitOpenedText(
  textarea: HTMLTextAreaElement,
  node: CanvasTextNode,
  boxHeight: number,
  scale: number
): void {
  textarea.style.height = `${boxHeight}px`
  const fitted = computeFit(
    (size) => {
      textarea.style.fontSize = `${size * scale}px`
      return textarea.scrollHeight <= textarea.clientHeight
    },
    { startSize: node.fontSize, min: MIN_FONT_SIZE, scale: FIT_SCALE }
  )
  textarea.style.fontSize = `${fitted.size * scale}px`
}
