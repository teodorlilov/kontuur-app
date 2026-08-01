'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface SelectControlProps<T extends string> {
  /** Sits outside the value, so the control reads "Client · Haelan". */
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}

/**
 * A labelled scoping control for the header's actions slot.
 *
 * Dashed rather than solid on purpose: it narrows what the page shows, it does
 * not act on anything, and it should not compete with the primary button
 * beside it.
 */
export function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectControlProps<T>) {
  return (
    <label
      className={cn(
        'relative inline-flex h-[35px] cursor-pointer items-center gap-1 rounded-sm border border-dashed border-line2',
        'pl-3 pr-0 text-[13px] text-text2 transition-colors duration-150 ease-contour',
        'hover:border-forest hover:bg-surface/60 focus-within:border-forest'
      )}
    >
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="cursor-pointer appearance-none bg-transparent py-0 pl-1 pr-[26px] text-[13px] font-medium text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-text2"
      />
    </label>
  )
}
