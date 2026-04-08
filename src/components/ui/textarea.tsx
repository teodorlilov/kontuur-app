'use client'

import { fieldBaseStyle, fieldErrorStyle, fieldLabelStyle, makeFieldHandlers } from './field-styles'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, style, id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label htmlFor={inputId} style={fieldLabelStyle}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        style={{
          ...fieldBaseStyle,
          minHeight: 100,
          resize: 'vertical',
          lineHeight: 1.6,
          ...(error ? fieldErrorStyle : {}),
          ...style,
        }}
        {...makeFieldHandlers<HTMLTextAreaElement>(error, props)}
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
