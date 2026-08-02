'use client'

import { cn } from '@/utils/cn'
import { useFieldContext } from './form/field-context'
import {
  CONTROL_DISABLED,
  CONTROL_FOCUS,
  CONTROL_INVALID,
  CONTROL_READONLY,
  CONTROL_SURFACE,
  CONTROL_TEXT,
  LABEL_CLASS,
  type LabelVariant,
} from './form/control-classes'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Standalone label. Inside a `Field`, omit this. */
  label?: string
  labelVariant?: LabelVariant
  error?: string
  /**
   * Grow with the content instead of scrolling.
   *
   * CSS `field-sizing` rather than a keystroke handler: reading `scrollHeight` to resize forces a
   * synchronous layout on every character typed.
   */
  autoGrow?: boolean
}

/** A multi-line text input. */
export function Textarea({
  label,
  labelVariant = 'default',
  error,
  autoGrow,
  className,
  id,
  ...props
}: TextareaProps) {
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
      <textarea
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={field?.describedBy}
        className={cn(
          CONTROL_SURFACE,
          CONTROL_FOCUS,
          CONTROL_TEXT,
          CONTROL_READONLY,
          CONTROL_DISABLED,
          CONTROL_INVALID,
          'min-h-[82px] px-3 py-2.5',
          autoGrow ? 'resize-none field-sizing-content' : 'resize-y',
          className
        )}
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
