'use client'

import { useEffect, useRef } from 'react'

/** Arrow-key step in authoring-space px, and the Shift-held step — Figma's defaults. */
const NUDGE_STEP = 1
const BIG_NUDGE_STEP = 10

interface EditorShortcutHandlers {
  /** The Escape ladder: leave the active mode, then the selection, then the editor. */
  onEscape: () => void
  undo: () => void
  redo: () => void
  removeSelected: () => void
  duplicateSelected: () => void
  nudgeSelected: (dx: number, dy: number) => void
  /** Step the selection through the stacking order; `toEdge` jumps to front/back. */
  reorderSelected: (direction: 'up' | 'down', toEdge: boolean) => void
  zoomIn: () => void
  zoomOut: () => void
  fitToScreen: () => void
  actualSize: () => void
  showShortcuts: () => void
}

/**
 * The editor's keyboard canon. Never fires while typing — the inline-edit textarea and every panel
 * input keep their own keys. Unlike the page-level surfaces this deliberately runs inside a dialog:
 * the editor IS the dialog that suspends them.
 *
 * `suspended` covers the editor's OWN dialogs (the apply-style panel, the shortcuts sheet, the
 * discard confirmation). Those portal outside this subtree, so a target check cannot see them — and
 * without this, ⌘Z pressed over an open panel silently undoes on the canvas behind it. It is read
 * through a ref rather than re-installing the listener, so the handler contract stays stable.
 */
export function useEditorShortcuts(handlers: EditorShortcutHandlers, suspended = false) {
  const ref = useRef(handlers)
  const suspendedRef = useRef(suspended)
  useEffect(() => {
    ref.current = handlers
    suspendedRef.current = suspended
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (suspendedRef.current) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return

      const current = ref.current
      const modified = event.metaKey || event.ctrlKey
      const key = event.key

      if (key === 'Escape') return current.onEscape()
      // '?' is Shift+/ on most layouts, so match the character rather than the physical key.
      if (key === '?' && !modified) {
        event.preventDefault()
        return current.showShortcuts()
      }

      // View commands. Shift+1/0 mirror Figma; ⌘+/− are what hands reach for out of the browser.
      if (event.shiftKey && !modified && (key === '!' || key === '1')) {
        event.preventDefault()
        return current.fitToScreen()
      }
      if (event.shiftKey && !modified && (key === ')' || key === '0')) {
        event.preventDefault()
        return current.actualSize()
      }
      if (modified && (key === '=' || key === '+')) {
        event.preventDefault()
        return current.zoomIn()
      }
      if (modified && key === '-') {
        event.preventDefault()
        return current.zoomOut()
      }

      if (modified && key.toLowerCase() === 'z') {
        event.preventDefault()
        return event.shiftKey ? current.redo() : current.undo()
      }
      if (modified && key.toLowerCase() === 'd') {
        event.preventDefault()
        return current.duplicateSelected()
      }
      if (modified && (key === ']' || key === '[')) {
        event.preventDefault()
        return current.reorderSelected(key === ']' ? 'up' : 'down', event.altKey)
      }
      if (key === 'Delete' || key === 'Backspace') return current.removeSelected()

      const step = event.shiftKey ? BIG_NUDGE_STEP : NUDGE_STEP
      const nudge = NUDGE_KEYS[key]
      if (nudge) {
        event.preventDefault()
        current.nudgeSelected(nudge.x * step, nudge.y * step)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

const NUDGE_KEYS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}
