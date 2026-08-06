'use client'

import { memo } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/utils/cn'

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
    <div className="absolute bottom-6 right-6 z-10">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative flex size-[52px] cursor-pointer items-center justify-center rounded-full border-none',
          'shadow-[0_4px_18px_rgba(12,46,32,0.28)]',
          // Open is the active state — Pine Deep, a tone shift from Deep Pine
          // rather than a hue change. Both branches used to be green anyway.
          isOpen ? 'bg-forest-deep' : 'bg-forest'
        )}
        // `all 0.2s` rides the default `ease`; Tailwind's transition-* would
        // swap in its own curve, so the shorthand stays a value.
        style={{ transition: 'all 0.2s' }}
      >
        <CalendarDays className="size-5 text-ink-inv" />

        {/* Badge */}
        {unscheduledCount > 0 && (
          // leading-none: a single digit centred in an 18px disc, where Label's
          // 1.2 would push it off the optical centre.
          // tracking-normal cancels the Label role's built-in 0.16em.
          <div className="absolute -right-0.5 -top-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-surface bg-pending text-label font-medium leading-none tracking-normal text-white">
            {unscheduledCount > 9 ? '9+' : unscheduledCount}
          </div>
        )}
      </button>
    </div>
  )
})
