'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { useShell } from '@/components/layout/shell-context'
import { NotificationsBell } from '@/components/layout/notifications-bell'
import { TOOL_ROW } from '@/components/layout/page-header/shared'
import { cn } from '@/utils/cn'

/**
 * The workspace utilities on the right of the rail: today, search,
 * notifications, and the signed-in user.
 *
 * Identical on every page, so it reads from chrome context rather than being
 * threaded through nine page components.
 */
export function RailTools() {
  const { todayLabel, userInitials, openPalette } = useShell()

  return (
    <div className="flex flex-none items-center gap-1.5">
      {/* Hidden on narrow screens first — it is the least load-bearing item here. */}
      <span className="hidden pr-1.5 text-xs tabular-nums text-text3 sm:block">{todayLabel}</span>

      <button type="button" onClick={openPalette} className={TOOL_ROW} aria-label="Search">
        <Search size={14} className="shrink-0" />
        <kbd className="rounded-xs border border-line2 px-1 py-px text-label font-semibold not-italic text-text3">
          ⌘K
        </kbd>
      </button>

      <NotificationsBell />

      <Link
        href="/settings"
        title="Your account"
        className={cn(
          'ml-1 grid size-[27px] shrink-0 place-items-center rounded-full bg-wash',
          'text-label font-semibold text-forest no-underline transition-colors hover:bg-sage'
        )}
      >
        {userInitials}
      </Link>
    </div>
  )
}
