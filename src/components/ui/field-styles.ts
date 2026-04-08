import type React from 'react'

export const fieldBaseStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-2)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 12px',
  fontSize: 13.5,
  fontFamily: 'var(--font-sans)',
  color: 'var(--color-text-1)',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
  outline: 'none',
}

export const fieldErrorStyle: React.CSSProperties = {
  borderColor: '#E24B4A',
  boxShadow: '0 0 0 3px rgba(226,75,74,0.10)',
}

export const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-text-2)',
  letterSpacing: '0.01em',
}

export function makeFieldHandlers<T extends HTMLElement>(
  error: string | undefined,
  external: {
    onFocus?: React.FocusEventHandler<T>
    onBlur?: React.FocusEventHandler<T>
    onMouseEnter?: React.MouseEventHandler<T>
    onMouseLeave?: React.MouseEventHandler<T>
  }
) {
  return {
    onFocus(e: React.FocusEvent<T>) {
      if (!error) {
        e.currentTarget.style.borderColor = 'var(--color-brand-accent)'
        e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-brand-light)'
      }
      external.onFocus?.(e)
    },
    onBlur(e: React.FocusEvent<T>) {
      if (!error) {
        e.currentTarget.style.borderColor = 'var(--color-border-2)'
        e.currentTarget.style.boxShadow = 'none'
      }
      external.onBlur?.(e)
    },
    onMouseEnter(e: React.MouseEvent<T>) {
      if (!e.currentTarget.matches(':focus') && !error) {
        e.currentTarget.style.borderColor = 'var(--color-border-3)'
      }
      external.onMouseEnter?.(e)
    },
    onMouseLeave(e: React.MouseEvent<T>) {
      if (!e.currentTarget.matches(':focus') && !error) {
        e.currentTarget.style.borderColor = 'var(--color-border-2)'
      }
      external.onMouseLeave?.(e)
    },
  }
}
