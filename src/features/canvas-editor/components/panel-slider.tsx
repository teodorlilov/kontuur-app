'use client'

import { cn } from '@/utils/cn'
import { EDITOR_LABEL } from './workspace/chrome'

interface PanelSliderProps {
  /** Full label including any value readout (e.g. "Zoom · 1.40×"). */
  label: string
  min: number
  max: number
  step: number
  value: number
  /** Greyed and inert — the caller says why beneath it, since a dead control with no reason reads as broken. */
  disabled?: boolean
  onChange: (value: number) => void
}

/**
 * The properties panel's standard labelled range row. Purely presentational — how a drag folds into
 * the undo history is the doc layer's business, not this component's.
 */
export function PanelSlider({ label, min, max, step, value, disabled, onChange }: PanelSliderProps) {
  return (
    <div>
      <div className={cn(EDITOR_LABEL, disabled && 'opacity-45')}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn('w-full accent-forest', disabled && 'cursor-not-allowed opacity-45')}
      />
    </div>
  )
}
