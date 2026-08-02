'use client'

import { PanelSlider } from './panel-slider'

// One brush-size range for every painting mode — the inpaint and eraser panels share it.
const BRUSH_MIN = 20
const BRUSH_MAX = 120
const BRUSH_STEP = 4

/** The brush-size slider shared by the panels of the stroke-based modes. */
export function BrushSizeSlider({
  size,
  onChange,
}: {
  size: number
  onChange: (size: number) => void
}) {
  return (
    <PanelSlider
      label={`Brush size · ${size}px`}
      min={BRUSH_MIN}
      max={BRUSH_MAX}
      step={BRUSH_STEP}
      value={size}
      onChange={onChange}
    />
  )
}
