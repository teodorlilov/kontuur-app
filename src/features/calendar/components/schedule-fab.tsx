'use client'

import { memo } from 'react'
import { CalendarDays } from 'lucide-react'

interface ScheduleFabProps {
  unscheduledCount: number
  isOpen: boolean
  onClick: () => void
}

/** Floating action button showing unscheduled post count. */
export const ScheduleFab = memo(function ScheduleFab({
  unscheduledCount,
  isOpen,
  onClick,
}: ScheduleFabProps) {
  return (
    <div style={{ position: 'absolute', bottom: 24, right: 24, zIndex: 10 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          // Open is the active state — Pine Deep, a tone shift from Deep Pine
          // rather than a hue change. Both branches used to be green anyway.
          background: isOpen ? 'var(--forest-deep)' : 'var(--forest)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 18px rgba(12,46,32,0.28)',
          transition: 'all 0.2s',
          position: 'relative',
        }}
      >
        <CalendarDays style={{ width: 20, height: 20, color: '#f2f5f1' }} />

        {/* Badge */}
        {unscheduledCount > 0 && (
          <div
            className="text-label tracking-normal"
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--pending)',
              border: '2px solid var(--surface)',
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
