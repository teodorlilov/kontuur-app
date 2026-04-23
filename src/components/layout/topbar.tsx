'use client'

import { NotificationsBell } from '@/components/layout/notifications-bell'
import { formatDateChip } from '@/utils/format-date-chip'

interface TopbarProps {
  title?: string
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header
      style={{
        height: 52,
        background: '#fff',
        borderBottom: '0.5px solid var(--color-border-1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 22px',
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
      }}
    >
      {/* Logo wordmark */}
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 13,
          letterSpacing: '3.5px',
          color: 'var(--color-text-1)',
          paddingRight: 16,
          borderRight: '0.5px solid var(--color-border-1)',
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        KONTUUR
      </div>

      {/* Page title */}
      {title && (
        <div
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: 18,
            fontWeight: 400,
            color: 'var(--color-text-1)',
          }}
        >
          {title}
        </div>
      )}

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            background: '#fff',
            border: '0.5px solid var(--color-border-1)',
            padding: '6px 12px',
            borderRadius: 7,
            letterSpacing: '0.3px',
          }}
        >
          {formatDateChip()}
        </span>
        <NotificationsBell />
      </div>
    </header>
  )
}
