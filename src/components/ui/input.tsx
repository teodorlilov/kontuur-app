'use client'

import { fieldBaseStyle, fieldErrorStyle, fieldLabelStyle, makeFieldHandlers } from './field-styles'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, style, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label htmlFor={inputId} style={fieldLabelStyle}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          ...fieldBaseStyle,
          height: 36,
          ...(error ? fieldErrorStyle : {}),
          ...style,
        }}
        {...makeFieldHandlers<HTMLInputElement>(error, props)}
        {...props}
      />
      {error && (
        <p style={{ fontSize: 12, color: 'var(--color-error-fg)' }} aria-live="polite">
          {error}
        </p>
      )}
    </div>
  )
}
