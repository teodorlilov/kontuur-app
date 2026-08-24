'use client'

import { cn } from '@/utils/cn'
import type { CanvasBackdrop } from '@/types/canvas'
import type { Palette } from '@/types/visual'
import { ColorSwatches } from '../color-swatches'
import { PanelSlider } from '../panel-slider'
import { FOCUS_RING } from './chrome'
import { ToolbarPopover } from './toolbar-popover'

/**
 * The toolbar controls that are too big for the bar: a colour, a range, and the slide's backdrop.
 *
 * The first two were spelled out at every call site — the colour three times (text, highlight,
 * backdrop) and the range twice (element opacity, backdrop strength), each re-picking its own
 * popover width. Shapes would have made that five and four.
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

interface BackdropPopoverProps {
  palette: Palette
  backdrop: CanvasBackdrop
  onChange: (patch: Partial<CanvasBackdrop>) => void
}

/**
 * The slide's backdrop: one chip in the bar, everything about it in one popover.
 *
 * It used to be four controls — a toggle, a coverage dropdown, a colour and a strength — for a
 * feature whose whole question is "what colour, if any, is behind this". Picking a colour turns it
 * on, because reaching for a colour IS asking for it; strength sits below the swatches for the
 * one-in-ten case where the picture should show through rather than go away.
 */
export function BackdropPopover({ palette, backdrop, onChange }: BackdropPopoverProps) {
  const label = 'Backdrop'
  return (
    <ToolbarPopover
      // The state in words, since the chip can only show it in colour — and a screen reader gets
      // "on at 40%" rather than a hex code it would have to spell out.
      label={
        backdrop.enabled
          ? `${label} · on at ${Math.round(backdrop.opacity * 100)}%`
          : `${label} · none`
      }
      text={label}
      swatch={backdrop.enabled ? backdrop.color : null}
      active={backdrop.enabled}
    >
      <div className="w-56">
        <ColorSwatches
          label={label}
          palette={palette}
          value={backdrop.color}
          onChange={(color) => onChange({ color, enabled: true })}
          leading={
            <button
              type="button"
              title="No backdrop — show the picture"
              aria-label="No backdrop"
              aria-pressed={!backdrop.enabled}
              onClick={() => onChange({ enabled: false })}
              className={cn(
                'size-6 cursor-pointer rounded-xs bg-paper',
                FOCUS_RING,
                !backdrop.enabled ? 'border-2 border-forest' : 'border border-line2'
              )}
            >
              {/* The struck-through square every drawing tool uses for "no fill". SVG rather than a
                  border trick so the line stays 1px at any chip size and inherits the text colour. */}
              <svg viewBox="0 0 24 24" aria-hidden className="size-full text-line2">
                <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          }
        />
        {/* Only once there is a backdrop to weaken: at 0% the slide looks untouched, so offering the
            slider while it is off invites a change with no visible result. */}
        {backdrop.enabled && (
          <div className="mt-3">
            <PanelSlider
              label={`Strength · ${Math.round(backdrop.opacity * 100)}%`}
              min={0.05}
              max={1}
              step={0.05}
              value={backdrop.opacity}
              onChange={(opacity) => onChange({ opacity })}
            />
          </div>
        )}
      </div>
    </ToolbarPopover>
  )
}
