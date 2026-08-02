'use client'

import { cn } from '@/utils/cn'
import { useFieldContext } from './form/field-context'
import {
  CONTROL_BASE,
  CONTROL_DISABLED,
  CONTROL_INVALID,
  CONTROL_READONLY,
  LABEL_CLASS,
  type LabelVariant,
} from './form/control-classes'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Standalone label. Inside a `Field`, omit this — the Field owns the label. */
  label?: string
  labelVariant?: LabelVariant
  error?: string
}

/**
 * A text input.
 *
 * Inside a `Field` it adopts that field's id, `aria-describedby` and invalid state and renders no
 * label of its own. Outside one it still renders a label and error, for the forms that have not
 * moved to the grid.
 */
export function Input({
  label,
  labelVariant = 'default',
  error,
  className,
  id,
  ...props
}: InputProps) {
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
      <input
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={field?.describedBy}
        className={cn(CONTROL_BASE, CONTROL_READONLY, CONTROL_DISABLED, CONTROL_INVALID, className)}
        {...props}
      />
      {error && (
        <p className="text-caption text-danger" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
