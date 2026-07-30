'use client'

import { ChevronUp } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useCanvaStatus } from '@/features/publishing/hooks/use-canva-status'

/**
 * Global "Design in Canva" topbar button.
 * Opens Canva in a new tab when connected, otherwise sits disabled with a hint.
 */
export function DesignInCanvaButton() {
  const connected = useCanvaStatus()

  return (
    <button
      type="button"
      onClick={() => {
        if (connected) window.open('https://www.canva.com/create/instagram-posts/', '_blank')
      }}
      disabled={!connected}
      title={connected ? undefined : 'Connect Canva in Settings'}
      className={cn(
        'hidden items-center gap-2 rounded-sm py-[7px] pl-2.5 pr-3.5 text-[13px] font-semibold sm:flex',
        'transition-colors duration-150',
        connected
          ? 'bg-forest text-white hover:bg-forest-deep'
          : 'cursor-default bg-sunken text-text3'
      )}
    >
      <span
        className={cn(
          'grid size-[22px] shrink-0 place-items-center rounded-xs text-[12px] font-bold',
          connected ? 'bg-white/20' : 'bg-ink/10'
        )}
      >
        C
      </span>
      Design in Canva
      <ChevronUp className="size-3.5 opacity-70" />
    </button>
  )
}
