'use client'

import { PANEL_LABEL } from './panel-styles'

interface PanelSliderProps {
  /** Full label including any value readout (e.g. "Zoom · 1.40×"). */
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  /** Fires when the drag/keyboard gesture ends — for consumers that commit on release. */
  onCommit?: () => void
}

/**
 * The properties panel's standard labelled range row. Purely presentational: per-tick consumers
 * (zoom, opacity, brush size) pass only onChange; preview-then-commit consumers (background
 * filters) additionally pass onCommit — the semantics stay at the call site.
 */
export function PanelSlider({ label, min, max, step, value, onChange, onCommit }: PanelSliderProps) {
  return (
    <div>
      <div style={PANEL_LABEL}>{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        style={{ width: '100%' }}
      />
    </div>
  )
}
