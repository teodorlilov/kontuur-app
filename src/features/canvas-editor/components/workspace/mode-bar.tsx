'use client'

import { cn } from '@/utils/cn'
import { BusyHint } from '../busy-hint'
import { BrushSizeSlider } from '../brush-size-slider'
import { EDITOR_BUTTON, EDITOR_CONTROL, EDITOR_PRESSED, TOOLBAR_DIVIDER } from './chrome'
import type { EditorJobs } from '../../hooks/use-editor-jobs'
import type { EditorMode } from '../../types'

interface ModeBarState {
  mode: Exclude<EditorMode, 'edit'>
  brushSize: number
  hasStrokes: boolean
  inpaintPrompt: string
  inpainting: boolean
  erasing: boolean
  repairing: boolean
  lassoCutting: boolean
  /**
   * The wait registry, for the hints below.
   *
   * The booleans above still say WHETHER to disable Apply — they are derived from this same list
   * upstream — and this says how long it has been. Reading the elapsed time from a job rather than
   * from the hint's own mount is what keeps this bar and the header's tray from reporting two
   * different ages for one piece of work.
   */
  jobs: EditorJobs
  onBrushSizeChange: (size: number) => void
  onPromptChange: (prompt: string) => void
  onClearStrokes: () => void
  onApplyInpaint: () => void
  onRemoveObject: () => void
  onApplyErase: () => void
  onApplyRepair: () => void
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

      {/* Repair is the inpaint gesture aimed at the selected picture: same prompt, same brush, same
          Apply. "Remove object" is not offered — on a placed picture that is the eraser, which is
          instant and free where this is a model call. */}
      {state.mode === 'repair' && (
        <>
          <input
            type="text"
            value={state.inpaintPrompt}
            placeholder="What should this part become?"
            onChange={(event) => state.onPromptChange(event.target.value)}
            className={cn(EDITOR_CONTROL, 'w-[280px]')}
          />
          <BrushControls {...state} />
          <button
            type="button"
            className={EDITOR_BUTTON}
            disabled={
              !state.hasStrokes || state.inpaintPrompt.trim().length === 0 || state.repairing
            }
            onClick={state.onApplyRepair}
          >
            Apply
          </button>
          {state.repairing && (
            <BusyHint label="Repairing the picture" job={state.jobs.find('repair')} />
          )}
        </>
      )}

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
            disabled={
              !state.hasStrokes || state.inpaintPrompt.trim().length === 0 || state.inpainting
            }
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
          {state.inpainting && (
            <BusyHint label="Repainting the picture" job={state.jobs.find('inpaint')} />
          )}
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
          {state.erasing && <BusyHint label="Erasing" job={state.jobs.find('erase')} />}
        </>
      )}

      {/* The lasso has no controls of its own either: the loop IS the instruction, and it cuts what
          it was drawn around. It kept a "snap to the object inside the loop" toggle for a while,
          which handed the loop to the matting model as a hint — but the model answers with the most
          subject-like thing it can find, so on a collage a loop drawn around a shape came back as
          the person beside it. "Cut out the subject" already asks that question properly. */}
      {state.mode === 'lasso' && state.lassoCutting && (
        <BusyHint label="Cutting out" job={state.jobs.find('lasso')} />
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
  repair: 'Repair this picture',
  erase: 'Erase',
  lasso: 'Lasso cut',
  reposition: 'Reposition background',
}
