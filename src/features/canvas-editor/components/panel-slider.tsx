'use client'

import { EDITOR_LABEL } from './workspace/chrome'

interface PanelSliderProps {
  /** Full label including any value readout (e.g. "Zoom · 1.40×"). */
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

/**
 * The properties panel's standard labelled range row. Purely presentational — how a drag folds into
 * the undo history is the doc layer's business, not this component's.
 */
export function PanelSlider({ label, min, max, step, value, onChange }: PanelSliderProps) {
  return (
    <div>
      <div className={EDITOR_LABEL}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-forest"
      />
    </div>
  )
}
