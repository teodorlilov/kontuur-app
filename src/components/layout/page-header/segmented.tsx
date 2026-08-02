'use client'

import { cn } from '@/utils/cn'

interface SegmentedProps<T extends string> {
  /** Names the group for screen readers — "Report range". */
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}

/**
 * A small set of mutually exclusive views, all worth showing at once.
 *
 * Use it only where every option fits on one row; anything longer belongs in a
 * SelectControl.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md bg-ink/[0.05] p-[3px]">
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-[29px] rounded-[7px] px-3 text-body transition-[background-color,color] duration-150 ease-contour',
              isActive
                ? 'bg-surface font-medium text-ink shadow-[0_1px_3px_rgba(15,21,18,0.1)]'
                : 'text-text2 hover:text-ink'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
