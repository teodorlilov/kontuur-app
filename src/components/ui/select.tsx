'use client'

import { cn } from '@/utils/cn'
import { useFieldContext } from './form/field-context'
import {
  CONTROL_BASE,
  CONTROL_DISABLED,
  CONTROL_INVALID,
  LABEL_CLASS,
  type LabelVariant,
} from './form/control-classes'

/** Inline chevron, stroked in Ink Secondary. Inlined as a data URI so it needs no network fetch. */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 10 10' fill='none' stroke='%2357625A' stroke-width='1.4'%3E%3Cpath d='M2.5 4L5 6.5 7.5 4'/%3E%3C/svg%3E\")"

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Standalone label. Inside a `Field`, omit this. */
  label?: string
  labelVariant?: LabelVariant
  error?: string
  options: Array<{ value: string; label: string }>
  placeholder?: string
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

/** A native select, restyled to match the other controls. */
export function Select({
  label,
  labelVariant = 'default',
  error,
  options,
  placeholder,
  className,
  id,
  ...props
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
      <select
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={field?.describedBy}
        className={cn(
          CONTROL_BASE,
          CONTROL_DISABLED,
          CONTROL_INVALID,
          'cursor-pointer appearance-none bg-[position:right_12px_center] bg-no-repeat pr-[34px]',
          className
        )}
        style={{ backgroundImage: CHEVRON }}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-caption text-danger" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
