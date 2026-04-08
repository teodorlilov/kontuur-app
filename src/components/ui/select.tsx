'use client'

import { fieldBaseStyle, fieldErrorStyle, fieldLabelStyle, makeFieldHandlers } from './field-styles'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
  placeholder?: string
}

export function Select({ label, error, options, placeholder, style, id, ...props }: SelectProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label htmlFor={inputId} style={fieldLabelStyle}>
          {label}
        </label>
      )}
      <select
        id={inputId}
        style={{
          ...fieldBaseStyle,
          height: 36,
          ...(error ? fieldErrorStyle : {}),
          ...style,
        }}
        {...makeFieldHandlers<HTMLSelectElement>(error, props)}
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
        <p style={{ fontSize: 12, color: 'var(--color-error-fg)' }} aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
