'use client'

import { memo } from 'react'
import { CalendarDays } from 'lucide-react'

interface ScheduleFabProps {
  unscheduledCount: number
  isOpen: boolean
  onClick: () => void
}

/** Floating action button showing unscheduled post count. */
export const ScheduleFab = memo(function ScheduleFab({ unscheduledCount, isOpen, onClick }: ScheduleFabProps) {
  return (
    <div style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 10 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: isOpen ? 'var(--color-terracotta)' : 'var(--color-brand)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 18px rgba(26,38,48,0.28)',
          transition: 'all 0.2s',
          position: 'relative',
        }}
      >
        <CalendarDays style={{ width: 20, height: 20, color: '#ECE8E1' }} />

        {/* Badge */}
        {unscheduledCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--color-terracotta)',
              border: '2px solid #fff',
              fontSize: 10,
              fontWeight: 500,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unscheduledCount > 9 ? '9+' : unscheduledCount}
          </div>
        )}
      </button>
    </div>
  )
})
