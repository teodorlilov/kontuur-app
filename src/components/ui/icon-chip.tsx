import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * A centred glyph on the wash fill — the chip beside a card title, a quick
 * action, or an empty-state line.
 *
 * Size and radius stay at the call site: they carry each surface's own rhythm,
 * and pinning them here would force a prop per variant for no gain. What this
 * owns is the pairing that was being restated — wash fill, forest glyph,
 * centred grid. Decorative by default; every call site pairs it with adjacent
 * text that already carries the meaning.
 */
export function IconChip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span aria-hidden="true" className={cn('grid place-items-center bg-wash text-forest', className)}>
      {children}
    </span>
  )
}
