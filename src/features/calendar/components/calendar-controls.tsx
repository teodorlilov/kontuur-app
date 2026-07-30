'use client'

import { memo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface CalendarControlsProps {
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  selectedClientId: string | null
  clients: { id: string; name: string }[]
  onClientChange: (id: string | null) => void
}

/**
 * Month navigation, today shortcut and client filter. Page-level controls: the
 * shell topbar owns the title, date chip, Canva link and notifications.
 */
export const CalendarControls = memo(function CalendarControls({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  selectedClientId,
  clients,
  onClientChange,
}: CalendarControlsProps) {
  return (
    <div className="relative z-[5] flex shrink-0 items-center gap-3 px-4 pb-2 pt-2 md:px-6">
      <div className="flex items-center gap-1">
        <MonthNavBtn onClick={onPrevMonth} direction="prev" />
        <div className="min-w-[120px] text-center text-[13px] font-medium text-ink">
          {MONTH_NAMES[month]} {year}
        </div>
        <MonthNavBtn onClick={onNextMonth} direction="next" />
      </div>

      <button
        type="button"
        onClick={onToday}
        className="rounded-sm border border-line2 bg-surface px-3 py-1.5 text-[11px] font-medium text-text2 transition-colors hover:border-forest hover:text-forest"
      >
        Today
      </button>

      {clients.length > 1 && (
        <select
          value={selectedClientId ?? ''}
          onChange={(event) => onClientChange(event.target.value || null)}
          className="ml-auto rounded-sm border border-line2 bg-surface px-2.5 py-1.5 text-[11px] text-text2 outline-none"
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      )}
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
      className="grid size-[26px] place-items-center rounded-sm border border-line2 bg-surface text-text2 transition-colors hover:border-forest hover:text-forest"
    >
      <Icon className="size-3.5" />
    </button>
  )
}
