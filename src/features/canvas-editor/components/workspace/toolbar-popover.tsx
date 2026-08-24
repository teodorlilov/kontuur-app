'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { cn } from '@/utils/cn'
import { EDITOR_BUTTON, EDITOR_ICON_BUTTON, EDITOR_PRESSED } from './chrome'

/**
 * The "no colour" chip: a hairline struck through an empty square, the convention every drawing tool
 * uses for a fill that is switched off. A blank chip alone would read as white.
 */
const NO_COLOUR =
  'linear-gradient(to top right, transparent calc(50% - 0.5px), var(--color-line2) calc(50% - 0.5px), var(--color-line2) calc(50% + 0.5px), transparent calc(50% + 0.5px))'

interface ToolbarPopoverProps {
  label: string
  /** A colour chip stands in for the control when the popover is closed; null draws "no colour". */
  swatch?: string | null
  /** Set when the chip alone would not say what the control is, and the bar has room to name it. */
  text?: string
  icon?: React.ReactNode
  /**
   * The control is carrying a non-default setting. Visual only — Radix already stamps
   * `aria-expanded`/`data-state` on the trigger, and a second `aria-pressed` would tell a screen
   * reader the button is a toggle. The state reaches assistive tech through `label` instead.
   */
  active?: boolean
  children: React.ReactNode
}

/**
 * A toolbar control whose contents are too big for the bar — a palette, a preset list. Portalled so
 * the toolbar's own overflow cannot clip it.
 */
export function ToolbarPopover({
  label,
  swatch,
  text,
  icon,
  active,
  children,
}: ToolbarPopoverProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className={cn(
            text ? EDITOR_BUTTON : EDITOR_ICON_BUTTON,
            (open || active) && EDITOR_PRESSED
          )}
        >
          {swatch !== undefined ? (
            <span
              aria-hidden
              className="size-4 rounded-xs border border-line2"
              style={{ background: swatch ?? NO_COLOUR }}
            />
          ) : (
            icon
          )}
          {text}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          // The popper reports how much room is left below the trigger; without a cap a tall
          // panel runs off the bottom of a short window with nothing to scroll.
          className="z-[210] max-h-[var(--radix-popper-available-height)] overflow-y-auto overscroll-contain rounded-chip border border-line bg-surface p-3 shadow-pop"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
