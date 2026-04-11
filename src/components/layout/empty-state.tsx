interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        gap: 8,
      }}
    >
      {icon && <div style={{ color: 'var(--color-border-2)', marginBottom: 4 }}>{icon}</div>}
      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-text-1)', margin: 0 }}>
        {title}
      </p>
      {description && (
        <p style={{ fontSize: 13.5, color: 'var(--color-text-3)', margin: 0, marginBottom: 8 }}>
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
