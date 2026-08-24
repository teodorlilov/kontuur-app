'use client'

import { useCallback, useState } from 'react'
import type { BrushStroke, EditorMode } from '../types'

/** Default inpaint/erase brush width in authoring-space px. */
const DEFAULT_BRUSH_SIZE = 60

export interface EditorModeState {
  mode: EditorMode
  strokes: BrushStroke[]
  brushSize: number
  inpaintPrompt: string
  setBrushSize: (size: number) => void
  setInpaintPrompt: (prompt: string) => void
  /** Enter a tool, or leave it when it is already the active one. */
  switchMode: (next: Exclude<EditorMode, 'edit'>) => void
  /** Return to plain editing, dropping any strokes in progress. */
  exitMode: () => void
  addStroke: (stroke: BrushStroke) => void
  clearStrokes: () => void
}

/**
 * The tools that work ON the selected picture, and so must not clear the selection when they open.
 *
 * Both paint onto one placed picture — the eraser cuts the strokes out of it, repair hands them to
 * the model as an editable zone. A cleared selection would leave either with no target and an Apply
 * that cannot do anything.
 */
const KEEPS_SELECTION = new Set<EditorMode>(['erase', 'repair'])

/**
 * Which tool is active and everything that tool is holding. Modes are exclusive: entering one
 * drops the strokes of the last and clears the selection — except the tools above, which work ON
 * the selection and so keep it.
 */
export function useEditorMode(clearSelection: () => void): EditorModeState {
  const [mode, setMode] = useState<EditorMode>('edit')
  const [strokes, setStrokes] = useState<BrushStroke[]>([])
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [inpaintPrompt, setInpaintPrompt] = useState('')

  const switchMode = useCallback(
    (next: Exclude<EditorMode, 'edit'>) => {
      if (!KEEPS_SELECTION.has(next)) clearSelection()
      setStrokes([])
      setMode((current) => (current === next ? 'edit' : next))
    },
    [clearSelection]
  )

  const exitMode = useCallback(() => {
    setMode('edit')
    setStrokes([])
  }, [])

  return {
    mode,
    strokes,
    brushSize,
    inpaintPrompt,
    setBrushSize,
    setInpaintPrompt,
    switchMode,
    exitMode,
    addStroke: useCallback((stroke: BrushStroke) => setStrokes((all) => [...all, stroke]), []),
    clearStrokes: useCallback(() => setStrokes([]), []),
  }
}
