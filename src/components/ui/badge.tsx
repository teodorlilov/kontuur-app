type BadgeVariant =
  | 'published'
  | 'scheduled'
  | 'pending'
  | 'draft'
  | 'error'
  // Legacy aliases kept for backward compatibility
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'default'
  | 'priority'

interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, { background: string; color: string }> = {
  published: { background: 'var(--color-published-bg)', color: 'var(--color-published-fg)' },
  scheduled: { background: 'var(--color-scheduled-bg)', color: 'var(--color-scheduled-fg)' },
  pending: { background: 'var(--color-pending-bg)', color: 'var(--color-pending-fg)' },
  draft: { background: 'var(--color-draft-bg)', color: 'var(--color-draft-fg)' },
  error: { background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' },
  // Legacy
  success: { background: 'var(--color-published-bg)', color: 'var(--color-published-fg)' },
  warning: { background: 'var(--color-pending-bg)', color: 'var(--color-pending-fg)' },
  danger: { background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' },
  info: { background: 'var(--color-scheduled-bg)', color: 'var(--color-scheduled-fg)' },
  default: { background: 'var(--color-draft-bg)', color: 'var(--color-draft-fg)' },
  priority: { background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' },
}

export function Badge({ variant = 'default', dot = false, children, className }: BadgeProps) {
  const styles = variantStyles[variant]
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.02em',
        padding: '3px 8px',
        borderRadius: 'var(--radius-xs)',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-sans)',
        background: styles.background,
        color: styles.color,
      }}
    >
      {dot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'currentColor',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}
