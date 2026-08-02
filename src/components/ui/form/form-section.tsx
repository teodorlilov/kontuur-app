'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { FieldProvider } from './field-context'
import { LABEL_CLASS, type LabelVariant } from './control-classes'

/** Column spans on the 12-column form grid. Everything collapses to full width below `lg`. */
const SPAN_CLASS = {
  12: 'col-span-12',
  6: 'col-span-12 lg:col-span-6',
  4: 'col-span-12 lg:col-span-4',
  3: 'col-span-12 lg:col-span-3',
} as const

export type FieldSpan = keyof typeof SPAN_CLASS

interface FormSectionProps {
  legend?: string
  description?: string
  className?: string
  children: ReactNode
}

/**
 * A group of related fields on the 12-column grid.
 *
 * A real `<fieldset>`/`<legend>`, so screen readers announce the group name with each control.
 * Consecutive sections separate themselves with a hairline rather than relying on the parent to
 * interleave dividers.
 */
export function FormSection({ legend, description, className, children }: FormSectionProps) {
  return (
    <fieldset
      className={cn(
        'grid min-w-0 grid-cols-12 gap-x-5 gap-y-[18px] border-0 p-0',
        '[&:not(:first-child)]:mt-7 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-line [&:not(:first-child)]:pt-7',
        className
      )}
    >
      {legend && (
        <legend className="col-span-12 float-left w-full p-0 text-body font-semibold text-ink">
          {legend}
          {description && (
            <span className="mt-0.5 block text-caption font-normal text-text3">{description}</span>
          )}
        </legend>
      )}
      {children}
    </fieldset>
  )
}

interface FieldProps {
  label: string
  /** `caps` is the DESIGN.md label role — 10px uppercase with wide tracking. */
  labelVariant?: LabelVariant
  span?: FieldSpan
  required?: boolean
  optional?: boolean
  hint?: string
  error?: string
  /** Rendered right-aligned in the label row, e.g. a character count. */
  count?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * One labelled control on the form grid.
 *
 * Owns the label row, the hint and the error, and publishes the ids for all three so the control
 * inside can wire `aria-describedby` itself.
 */
export function Field({
  label,
  labelVariant = 'default',
  span = 12,
  required,
  optional,
  hint,
  error,
  count,
  className,
  children,
}: FieldProps) {
  const id = useId()
  const controlId = `${id}-control`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn(SPAN_CLASS[span], 'min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline gap-[7px]">
        <label htmlFor={controlId} className={LABEL_CLASS[labelVariant]}>
          {label}
        </label>
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
        {optional && <span className="text-caption font-normal text-text3">optional</span>}
        {count && <span className="ml-auto text-caption tabular-nums text-text3">{count}</span>}
      </div>

      <FieldProvider value={{ controlId, describedBy, invalid: !!error }}>{children}</FieldProvider>

      {hint && (
        <p id={hintId} className="mt-1.5 text-caption text-text3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-caption text-danger" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
