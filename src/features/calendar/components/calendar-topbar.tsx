'use client'

import { memo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDateChip } from '@/utils/format-date-chip'
import { NotificationsBell } from '@/components/layout/notifications-bell'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface CalendarTopbarProps {
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  selectedClientId: string | null
  clients: { id: string; name: string }[]
  onClientChange: (id: string | null) => void
}

/** Month navigation bar with client filter and today shortcut. */
export const CalendarTopbar = memo(function CalendarTopbar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  selectedClientId,
  clients,
  onClientChange,
}: CalendarTopbarProps) {
  return (
    <div
      className="pl-14 md:pl-[22px]"
      style={{
        height: 52,
        background: '#fff',
        borderBottom: '0.5px solid var(--color-border-1)',
        display: 'flex',
        alignItems: 'center',
        paddingRight: 22,
        gap: 14,
        flexShrink: 0,
        boxShadow: '0 1px 0 rgba(44,62,80,0.05)',
        position: 'relative',
        zIndex: 5,
      }}
    >
      {/* Logo wordmark — hidden on mobile where sidebar logo is used */}
      <div
        className="hidden md:block"
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 13,
          letterSpacing: '3.5px',
          color: 'var(--color-text-1)',
          paddingRight: 16,
          borderRight: '0.5px solid var(--color-border-1)',
          marginRight: 2,
          flexShrink: 0,
        }}
      >
        KONTUUR
      </div>

      {/* Page title */}
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 18,
          fontWeight: 400,
          color: 'var(--color-text-1)',
        }}
      >
        Calendar
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <MonthNavBtn onClick={onPrevMonth} direction="prev" />
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-text-1)',
            minWidth: 120,
            textAlign: 'center',
          }}
        >
          {MONTH_NAMES[month]} {year}
        </div>
        <MonthNavBtn onClick={onNextMonth} direction="next" />
      </div>

      {/* Today button */}
      <button
        type="button"
        onClick={onToday}
        style={{
          padding: '5px 11px',
          border: '0.5px solid var(--color-border-2)',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--color-muted)',
          background: '#fff',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        Today
      </button>

      {/* Right side controls */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Client selector */}
        {clients.length > 1 && (
          <select
            value={selectedClientId ?? ''}
            onChange={(e) => onClientChange(e.target.value || null)}
            style={{
              padding: '6px 10px',
              border: '0.5px solid var(--color-border-2)',
              borderRadius: 7,
              fontSize: 11,
              fontFamily: 'inherit',
              color: 'var(--color-muted)',
              background: '#fff',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {/* Date chip — hidden on mobile to save space */}
        <span
          className="hidden md:inline"
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
    </div>
  )
})

function MonthNavBtn({ onClick, direction }: { onClick: () => void; direction: 'prev' | 'next' }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous month' : 'Next month'}
      style={{
        width: 26,
        height: 26,
        border: '0.5px solid var(--color-border-2)',
        borderRadius: 6,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--color-muted)',
        transition: 'all 0.15s',
      }}
    >
      <Icon style={{ width: 14, height: 14 }} />
    </button>
  )
}
