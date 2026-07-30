'use client'

import { usePathname } from 'next/navigation'
import { NotificationsBell } from '@/components/layout/notifications-bell'
import { DesignInCanvaButton } from '@/components/layout/design-in-canva-button'
import { resolveNavTitle } from '@/components/layout/nav-items'
import { formatDateChip } from '@/utils/format-date-chip'

interface TopbarProps {
  agencyMode: 'agency' | 'solo'
}

/**
 * Shell topbar. The title comes from the route, not from each page — the shell
 * owns its chrome so pages only render content.
 */
export function Topbar({ agencyMode }: TopbarProps) {
  const pathname = usePathname()

  return (
    <header className="app-topbar flex h-[54px] shrink-0 items-center pl-14 pr-1 md:pl-2">
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
        {resolveNavTitle(pathname, agencyMode)}
      </span>

      <div className="ml-auto flex items-center gap-2.5">
        <DesignInCanvaButton />
        <span className="hidden rounded-sm border border-line2 px-3 py-[7px] text-[12.5px] tabular-nums text-text2 sm:inline">
          {formatDateChip()}
        </span>
        <NotificationsBell />
      </div>
    </header>
  )
}
