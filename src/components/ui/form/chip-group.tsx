'use client'

import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface ChipGroupProps {
  /** Names the set for screen readers, e.g. "Publishing platform". */
  label: string
  className?: string
  children: ReactNode
}

/** A row of selectable chips. */
export function ChipGroup({ label, className, children }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-[7px]', className)}>
      {children}
    </div>
  )
}

interface ChipProps {
  pressed: boolean
  onClick?: () => void
  disabled?: boolean
  /** Shows a Living Green dot — used for platforms with a connected account. */
  live?: boolean
  children: ReactNode
}

/** One chip. Toggle semantics, so `aria-pressed` is correct here. */
export function Chip({ pressed, onClick, disabled, live, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-[34px] items-center gap-[7px] rounded-full border px-3.5 text-[13px]',
        'transition-colors duration-150 ease-contour',
        pressed
          ? 'border-forest bg-forest font-medium text-surface'
          : 'border-line2 bg-surface text-text2 hover:border-text3/45 hover:text-ink',
        disabled && 'cursor-not-allowed opacity-40 hover:border-line2 hover:text-text2'
      )}
    >
      {live !== undefined && (
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            live ? 'bg-spring' : pressed ? 'bg-surface/50' : 'bg-line2'
          )}
        />
      )}
      {children}
    </button>
  )
}
