'use client'

import { cn } from '@/utils/cn'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // Base
        'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap',
        'transition-[background,border-color] duration-150 ease-out',
        'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
        'active:scale-[0.98]',
        // Variant — colours via inline style; only structural classes here
        variant === 'primary' && 'border-none',
        (variant === 'secondary' || variant === 'danger') && 'border-solid',
        // Size
        size === 'sm' && 'text-xs px-3 py-[5px] rounded-md',
        size === 'md' && 'text-[13.5px] px-4 py-2 rounded-lg',
        size === 'lg' && 'text-[15px] px-[22px] py-[11px] rounded-lg',
        className
      )}
      style={{
        fontFamily: 'var(--font-sans)',
        lineHeight: 1,
        ...(variant === 'primary'
          ? {
              background: 'var(--color-brand)',
              color: 'var(--color-text-inv)',
            }
          : variant === 'secondary'
            ? {
                background: 'transparent',
                color: 'var(--color-text-1)',
                borderColor: 'var(--color-border-2)',
                borderWidth: '0.5px',
                borderStyle: 'solid',
              }
            : variant === 'ghost'
              ? {
                  background: 'transparent',
                  color: 'var(--color-text-2)',
                }
              : variant === 'danger'
                ? {
                    background: 'transparent',
                    color: 'var(--color-error-fg)',
                    borderColor: 'var(--color-error-bg)',
                    borderWidth: '0.5px',
                    borderStyle: 'solid',
                  }
                : {}),
        ...style,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        if (variant === 'primary') el.style.background = 'var(--color-brand-hover)'
        if (variant === 'secondary') {
          el.style.background = 'var(--color-overlay)'
          el.style.borderColor = 'var(--color-border-3)'
        }
        if (variant === 'ghost') {
          el.style.background = 'var(--color-overlay)'
          el.style.color = 'var(--color-text-1)'
        }
        if (variant === 'danger') el.style.background = 'var(--color-error-bg)'
        props.onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        if (variant === 'primary') el.style.background = 'var(--color-brand)'
        if (variant === 'secondary') {
          el.style.background = 'transparent'
          el.style.borderColor = 'var(--color-border-2)'
        }
        if (variant === 'ghost') {
          el.style.background = 'transparent'
          el.style.color = 'var(--color-text-2)'
        }
        if (variant === 'danger') el.style.background = 'transparent'
        props.onMouseLeave?.(e)
      }}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin"
          style={{ width: 14, height: 14 }}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
