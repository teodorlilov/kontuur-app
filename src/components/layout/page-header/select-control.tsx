'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Listbox } from '@/components/ui/listbox'

interface SelectControlProps<T extends string> {
  /** Sits outside the value, so the control reads "Client · Haelan". */
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}

/**
 * A labelled scoping control for the header's actions slot, opening the
 * system's Listbox menu.
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
    <Listbox
      value={value}
      options={options}
      onChange={onChange}
      label={label}
      menuWidth="auto"
      renderTrigger={(selected, open) => (
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            'inline-flex h-[35px] cursor-pointer items-center gap-1 rounded-sm border border-dashed border-line2',
            'px-3 text-body text-text2 transition-colors duration-150 ease-contour',
            'hover:border-forest hover:bg-surface/60',
            open && 'border-forest bg-surface/60'
          )}
        >
          {label}
          <span className="pl-1 font-medium text-ink">{selected?.label}</span>
          <ChevronDown
            size={12}
            aria-hidden="true"
            className={cn(
              'ml-1 text-text2 transition-transform duration-150 ease-contour',
              open && 'rotate-180'
            )}
          />
        </button>
      )}
    />
  )
}
