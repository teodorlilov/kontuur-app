import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * The one definition of tone → token classes for pills. Exported because
 * StatCard renders its own pill geometry but must not restate these pairings:
 * three of them were duplicated verbatim there until the vocabularies
 * (`ok`/`warn`/`bad` vs `positive`/`attention`/`danger`) hid it from a grep.
 */
export const PILL_TONES = {
  ok: 'bg-wash text-forest',
  warn: 'bg-pending-bg text-pending',
  /** Clay, not signal-red — the status hues in this system are earthen. */
  bad: 'bg-danger-bg text-danger',
  mark: 'bg-accent text-forest-deep',
  /**
   * The Marker highlight, which DESIGN.md § Chips pairs with "scheduled".
   * Distinct from `mark` above: that is the New Growth *plate*, which the Standing
   * Place Rule reserves for where the user is, never for a permanent property.
   */
  marker: 'bg-marker text-forest-deep',
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
        'inline-flex h-[23px] flex-none items-center rounded-full px-2.5 text-micro font-semibold',
        PILL_TONES[tone]
      )}
    >
      {children}
    </span>
  )
}
