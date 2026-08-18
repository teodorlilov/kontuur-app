'use client'

import { useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'
import { focusableItems, rovingFocus } from './roving-focus'

export interface ListboxOption<T extends string = string> {
  value: T
  label: string
  /** A quieter second line — a niche, a cadence, a role. */
  description?: string
  /** Leading visual — an Avatar, an icon chip. */
  leading?: React.ReactNode
}

interface ListboxProps<T extends string> {
  value: T
  options: ReadonlyArray<ListboxOption<T>>
  onChange: (value: T) => void
  /** Names the listbox for screen readers. */
  label: string
  disabled?: boolean
  /**
   * The closed control. Must return a single focusable element — Radix attaches
   * the trigger behaviour to it via asChild.
   */
  renderTrigger: (selected: ListboxOption<T> | undefined, open: boolean) => React.ReactElement
  align?: 'start' | 'end'
  /** 'trigger' matches the trigger's width; 'auto' sizes to content. */
  menuWidth?: 'trigger' | 'auto'
}

/**
 * The system's dropdown: a floating, scrollable listbox with rich option rows.
 * Portalled (Radix Popover), so no scroll container or animated ancestor can
 * clip it, capped to the viewport room Radix reports. `Select` (forms),
 * `SelectControl` (page headers) and the generate flow's client picker are all
 * skins over this one primitive.
 */
export function Listbox<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  renderTrigger,
  align = 'start',
  menuWidth = 'trigger',
}: ListboxProps<T>) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  /** Roving arrow-key focus over the option buttons — Popover has no own roving. */
  function handleKeyDown(event: React.KeyboardEvent) {
    rovingFocus(event, focusableItems(listRef.current, '[role="option"]'))
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <Popover.Trigger asChild disabled={disabled} aria-haspopup="listbox">
        {renderTrigger(selected, open)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={listRef}
          role="listbox"
          aria-label={label}
          align={align}
          sideOffset={4}
          onKeyDown={handleKeyDown}
          // Land on the current choice, not the top of the list.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const current =
              listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
            ;(
              current ?? listRef.current?.querySelector<HTMLButtonElement>('[role="option"]')
            )?.focus()
          }}
          className={cn(
            'z-[210] max-h-[min(360px,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain',
            'rounded-panel border border-line bg-surface p-1 shadow-pop',
            menuWidth === 'trigger'
              ? 'w-[var(--radix-popover-trigger-width)]'
              : 'min-w-[var(--radix-popover-trigger-width)]'
          )}
        >
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setOpen(false)
                  if (option.value !== value) onChange(option.value)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-chip px-2.5 py-2 text-left',
                  'transition-colors duration-150 ease-contour hover:bg-wash focus-visible:bg-wash',
                  isSelected && 'bg-wash'
                )}
              >
                {option.leading}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block truncate text-micro text-text3">
                      {option.description}
                    </span>
                  )}
                </span>
                <Check
                  aria-hidden
                  className={cn('size-3.5 flex-none text-forest', !isSelected && 'opacity-0')}
                  strokeWidth={2}
                />
              </button>
            )
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
