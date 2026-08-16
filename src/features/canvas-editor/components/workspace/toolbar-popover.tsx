'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { cn } from '@/utils/cn'
import { EDITOR_ICON_BUTTON, EDITOR_PRESSED } from './chrome'

interface ToolbarPopoverProps {
  label: string
  /** A colour chip stands in for the control when the popover is closed. */
  swatch?: string
  icon?: React.ReactNode
  children: React.ReactNode
}

/**
 * A toolbar control whose contents are too big for the bar — a palette, a preset list. Portalled so
 * the toolbar's own overflow cannot clip it.
 */
export function ToolbarPopover({ label, swatch, icon, children }: ToolbarPopoverProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className={cn(EDITOR_ICON_BUTTON, open && EDITOR_PRESSED)}
        >
          {swatch !== undefined ? (
            <span
              aria-hidden
              className="size-4 rounded-xs border border-line2"
              style={{ background: swatch }}
            />
          ) : (
            icon
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-[210] rounded-chip border border-line bg-surface p-3 shadow-pop"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
