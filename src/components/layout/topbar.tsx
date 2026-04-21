'use client'

import { NotificationsBell } from '@/components/layout/notifications-bell'

/** Formats today's date as "Mon, 21 April 2026". */
function formatDateChip(): string {
  const now = new Date()
  const day = now.toLocaleDateString('en-GB', { weekday: 'short' })
  const date = now.getDate()
  const month = now.toLocaleDateString('en-GB', { month: 'long' })
  const year = now.getFullYear()
  return `${day}, ${date} ${month} ${year}`
}

export function Topbar() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '24px 32px 0',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-muted)',
            background: '#fff',
            border: '0.5px solid rgba(44,62,80,0.10)',
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
