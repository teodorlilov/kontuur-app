'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Listbox } from './listbox'
import { useFieldContext } from './form/field-context'
import {
  CONTROL_SURFACE,
  CONTROL_TEXT,
  LABEL_CLASS,
  type LabelVariant,
} from './form/control-classes'

interface SelectProps {
  /** Standalone label. Inside a `Field`, omit this. */
  label?: string
  labelVariant?: LabelVariant
  error?: string
  options: Array<{ value: string; label: string }>
  placeholder?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * Guarantees the current value is selectable, prepending it when the list has never heard of it.
 *
 * A client saved before a language joined the list, or a value a site read produced that the list
 * does not carry, would otherwise silently render as the first option — the control would show one
 * language while the record held another.
 */
export function ensureOption(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string
): Array<{ value: string; label: string }> {
  if (!value || options.some((option) => option.value === value)) return [...options]
  return [{ value, label: value }, ...options]
}

/**
 * The form select, rendered as the system's Listbox rather than a native
 * `<select>` — the same floating menu everywhere a dropdown opens. The API
 * changed with it: `onChange` receives the value directly, not a change event.
 */
export function Select({
  label,
  labelVariant = 'default',
  error,
  options,
  placeholder,
  value,
  onChange,
  disabled,
  className,
  id,
}: SelectProps) {
  const field = useFieldContext()
  const inputId = id ?? field?.controlId ?? label?.toLowerCase().replace(/\s+/g, '-')
  const invalid = !!error || field?.invalid

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className={LABEL_CLASS[labelVariant]}>
          {label}
        </label>
      )}
      <Listbox
        value={value}
        options={options}
        onChange={onChange}
        label={label ?? placeholder ?? 'Options'}
        disabled={disabled}
        renderTrigger={(selected, open) => (
          <button
            type="button"
            id={inputId}
            // No aria-invalid: unsupported on button. The Clay edge carries it
            // visually and the error paragraph below announces it via aria-live
            // plus the Field's describedBy wiring.
            aria-describedby={field?.describedBy}
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              CONTROL_SURFACE,
              CONTROL_TEXT,
              'flex h-10 cursor-pointer items-center gap-2 px-3 text-left',
              invalid && 'border-danger',
              disabled && 'cursor-not-allowed bg-sunken text-text3',
              className
            )}
          >
            <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-text3')}>
              {selected?.label ?? placeholder ?? 'Choose…'}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3 flex-none text-text2 transition-transform duration-150 ease-contour',
                open && 'rotate-180'
              )}
            />
          </button>
        )}
      />
      {error && (
        <p className="text-caption text-danger" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
