'use client'

import { ExternalLink } from 'lucide-react'
import { cn } from '@/utils/cn'
import { SIDEBAR_ROW, SIDEBAR_ROW_IDLE } from '@/components/layout/nav-items'
import { useCanvaStatus } from '@/features/assets/hooks/use-canva-status'

/**
 * "Design in Canva" — a sidebar row, not a page control.
 *
 * It opens canva.com in a new tab and belongs to the workspace rather than to
 * any one page, which is why it sits with the other global chrome in the rail.
 * Disabled until Canva is connected, with the hint pointing at Settings.
 */
export function DesignInCanvaButton({ collapsed = false }: { collapsed?: boolean }) {
  const connected = useCanvaStatus()
  const label = 'Design in Canva'

  return (
    <button
      type="button"
      onClick={() => {
        if (connected) window.open('https://www.canva.com/create/instagram-posts/', '_blank')
      }}
      disabled={!connected}
      title={connected ? (collapsed ? label : undefined) : 'Connect Canva in Settings'}
      className={cn(
        SIDEBAR_ROW,
        connected ? SIDEBAR_ROW_IDLE : 'cursor-default text-text3',
        collapsed && 'justify-center px-0'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-[15px] shrink-0 place-items-center rounded-xs text-label font-semibold',
          connected ? 'bg-forest text-white' : 'bg-ink/10 text-text3'
        )}
      >
        C
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {connected && <ExternalLink size={13} className="shrink-0 text-text3" />}
        </>
      )}
    </button>
  )
}
