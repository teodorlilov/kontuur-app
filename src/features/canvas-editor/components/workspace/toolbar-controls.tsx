'use client'

import type { Palette } from '@/types/visual'
import { ColorSwatches } from '../color-swatches'
import { PanelSlider } from '../panel-slider'
import { ToolbarPopover } from './toolbar-popover'

/**
 * The two toolbar controls that are too big for the bar: a colour and a range.
 *
 * Both were spelled out at every call site — the colour three times (text, highlight, scrim) and
 * the range twice (element opacity, scrim opacity), each re-picking its own popover width. Shapes
 * would have made that five and four.
 */

interface ColorPopoverProps {
  /** Names the control and titles its trigger; the swatch shows the value. */
  label: string
  palette: Palette
  value: string
  onChange: (hex: string) => void
}

/** A colour chip that opens the brand palette, a free picker, a hex field and the eyedropper. */
export function ColorPopover({ label, palette, value, onChange }: ColorPopoverProps) {
  return (
    <ToolbarPopover label={label} swatch={value}>
      <div className="w-56">
        <ColorSwatches label={label} palette={palette} value={value} onChange={onChange} />
      </div>
    </ToolbarPopover>
  )
}

interface SliderPopoverProps {
  label: string
  icon: React.ReactNode
  /** Appended to the label inside the popover, e.g. "80%" or "12px". */
  readout: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

/** An icon button that opens one labelled range — the toolbar's home for a single number. */
export function SliderPopover({ label, icon, readout, ...slider }: SliderPopoverProps) {
  return (
    <ToolbarPopover label={label} icon={icon}>
      <div className="w-52">
        <PanelSlider label={`${label} · ${readout}`} {...slider} />
      </div>
    </ToolbarPopover>
  )
}
