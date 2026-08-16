'use client'

import { cn } from '@/utils/cn'
import { BusyHint } from '../busy-hint'
import { BrushSizeSlider } from '../brush-size-slider'
import { EDITOR_BUTTON, EDITOR_CONTROL, EDITOR_PRESSED, TOOLBAR_DIVIDER } from './chrome'
import type { EditorMode } from '../../types'

interface ModeBarState {
  mode: Exclude<EditorMode, 'edit'>
  brushSize: number
  hasStrokes: boolean
  inpaintPrompt: string
  lassoDetect: boolean
  inpainting: boolean
  erasing: boolean
  lassoCutting: boolean
  onBrushSizeChange: (size: number) => void
  onPromptChange: (prompt: string) => void
  onDetectChange: (detect: boolean) => void
  onClearStrokes: () => void
  onApplyInpaint: () => void
  onRemoveObject: () => void
  onApplyErase: () => void
  onDone: () => void
}

/**
 * The bar a tool takes over while it is active. It replaces the selection toolbar rather than the
 * whole panel, so entering a mode no longer hides everything else the editor can do.
 */
export function ModeBar(state: ModeBarState) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-wash px-3">
      <span className="shrink-0 font-sans text-caption font-medium text-forest">
        {MODE_TITLES[state.mode]}
      </span>
      <span className={TOOLBAR_DIVIDER} aria-hidden />

      {state.mode === 'inpaint' && (
        <>
          <input
            type="text"
            value={state.inpaintPrompt}
            placeholder="What belongs there instead?"
            onChange={(event) => state.onPromptChange(event.target.value)}
            className={cn(EDITOR_CONTROL, 'w-[280px]')}
          />
          <BrushControls {...state} />
          <button
            type="button"
            className={EDITOR_BUTTON}
            disabled={!state.hasStrokes || state.inpaintPrompt.trim().length === 0 || state.inpainting}
            onClick={state.onApplyInpaint}
          >
            Apply
          </button>
          <button
            type="button"
            className={EDITOR_BUTTON}
            disabled={!state.hasStrokes || state.inpainting}
            title="Erase what you painted over and let AI continue the background"
            onClick={state.onRemoveObject}
          >
            Remove object
          </button>
          {state.inpainting && <BusyHint label="Repainting the backdrop" typicalSeconds={45} />}
        </>
      )}

      {state.mode === 'erase' && (
        <>
          <BrushControls {...state} />
          <button
            type="button"
            className={EDITOR_BUTTON}
            disabled={!state.hasStrokes || state.erasing}
            onClick={state.onApplyErase}
          >
            Apply
          </button>
          {state.erasing && <BusyHint label="Erasing" typicalSeconds={8} />}
        </>
      )}

      {state.mode === 'lasso' && (
        <>
          <label className="inline-flex cursor-pointer items-center gap-2 font-sans text-caption text-ink">
            <input
              type="checkbox"
              checked={state.lassoDetect}
              onChange={(event) => state.onDetectChange(event.target.checked)}
              className="size-3.5 accent-forest"
            />
            Snap to the object inside the loop
          </label>
          {state.lassoCutting && <BusyHint label="Cutting out" typicalSeconds={12} />}
        </>
      )}

      {/* Reposition has no controls of its own — the gesture IS the tool, and the ModeHint over
          the canvas states it. Saying it here too would be the same instruction in two places. */}

      <span className="flex-1" />
      <button type="button" className={cn(EDITOR_BUTTON, EDITOR_PRESSED)} onClick={state.onDone}>
        Done
      </button>
    </div>
  )
}

function BrushControls(state: ModeBarState) {
  return (
    <>
      <div className="w-[132px] shrink-0">
        <BrushSizeSlider size={state.brushSize} onChange={state.onBrushSizeChange} />
      </div>
      <button
        type="button"
        className={EDITOR_BUTTON}
        disabled={!state.hasStrokes}
        onClick={state.onClearStrokes}
      >
        Clear
      </button>
    </>
  )
}

const MODE_TITLES: Record<Exclude<EditorMode, 'edit'>, string> = {
  inpaint: 'AI repair',
  erase: 'Erase',
  lasso: 'Lasso cut',
  reposition: 'Reposition background',
}
