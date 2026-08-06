'use client'

import { cn } from '@/utils/cn'

interface PanelCheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  title?: string
}

/** The properties panel's standard labelled checkbox row (uppercase, italic, above-text, …). */
export function PanelCheckbox({ label, checked, onChange, disabled, title }: PanelCheckboxProps) {
  return (
    <label
      title={title}
      className={cn(
        'flex items-center gap-2 text-caption text-ink',
        disabled ? 'cursor-default opacity-50' : 'cursor-pointer'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}
