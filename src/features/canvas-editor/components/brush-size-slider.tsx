'use client'

import { PANEL_LABEL } from './panel-styles'

// One brush-size range for every painting mode — the inpaint and eraser panels share it.
const BRUSH_MIN = 20
const BRUSH_MAX = 120
const BRUSH_STEP = 4

/** The brush-size slider shared by the panels of the stroke-based modes. */
export function BrushSizeSlider({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  return (
    <div>
      <div style={PANEL_LABEL}>Brush size · {size}px</div>
      <input
        type="range"
        min={BRUSH_MIN}
        max={BRUSH_MAX}
        step={BRUSH_STEP}
        value={size}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}
