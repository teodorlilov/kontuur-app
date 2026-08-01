import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

const PILL_TONES = {
  ok: 'bg-wash text-forest',
  warn: 'bg-pending-bg text-pending',
  bad: 'bg-danger-bg text-danger',
  mark: 'bg-accent text-forest-deep',
  /** No judgement — a label like "you" that states a fact rather than a status. */
  neutral: 'bg-ink/[0.05] text-text3',
} as const

export type PillTone = keyof typeof PILL_TONES

/**
 * A compact status label — never the only signal for the state it describes.
 *
 * Lives here rather than beside `PageHeader` because most of its call sites are panel rows, not
 * headers: importing it from the header module pulled that module's client subtree — the crumb
 * trail, the rail tools, the sticky shell — into seven files that render none of them.
 */
export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-[23px] flex-none items-center rounded-full px-2.5 text-[11px] font-semibold',
        PILL_TONES[tone]
      )}
    >
      {children}
    </span>
  )
}
