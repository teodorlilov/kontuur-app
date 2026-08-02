import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface RailBoxProps {
  title: string
  /** `mark` tints the box for the one thing on the panel that wants attention. */
  tone?: 'default' | 'mark'
  className?: string
  children: ReactNode
}

/**
 * A boxed aside beside a form.
 *
 * Dashed rather than solid on purpose: the rail is context, and a solid edge here would compete
 * with the form controls, which are the only genuinely interactive edges on the panel.
 */
export function RailBox({ title, tone = 'default', className, children }: RailBoxProps) {
  return (
    <div
      className={cn(
        'mb-3 rounded-panel border border-dashed border-line2 px-4 py-[15px]',
        tone === 'mark' && 'border-spring/30 bg-marker/40',
        className
      )}
    >
      <h4 className="mb-2.5 text-label font-semibold uppercase text-text3">{title}</h4>
      {children}
    </div>
  )
}

/** One key/value line inside a `RailBox`. */
export function RailStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px] text-caption">
      <span className="text-text3">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

/** Body copy inside a `RailBox`. */
export function RailText({ children }: { children: ReactNode }) {
  return <p className="text-caption leading-[1.55] text-text2 [&+&]:mt-2">{children}</p>
}
