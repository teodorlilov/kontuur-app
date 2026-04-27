'use client'

interface SectionCardProps {
  title: string
  subtitle?: string
  headerAction?: React.ReactNode
  danger?: boolean
  children: React.ReactNode
}

/** Reusable card wrapper with structured header for settings sections. */
export function SectionCard({ title, subtitle, headerAction, danger, children }: SectionCardProps) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: danger
          ? '0.5px solid rgba(180,50,50,0.15)'
          : '0.5px solid rgba(44,62,80,0.10)',
        borderRadius: 13,
        overflow: 'hidden',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          padding: '18px 22px 14px',
          borderBottom: danger
            ? '0.5px solid rgba(180,50,50,0.07)'
            : '0.5px solid rgba(44,62,80,0.07)',
          background: danger ? 'rgba(180,50,50,0.015)' : 'transparent',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: danger ? '#A04030' : 'var(--color-text-1)',
              marginBottom: 2,
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11, color: 'var(--color-muted)', lineHeight: 1.5 }}>
              {subtitle}
            </div>
          )}
        </div>
        {headerAction}
      </div>
      {children}
    </div>
  )
}
