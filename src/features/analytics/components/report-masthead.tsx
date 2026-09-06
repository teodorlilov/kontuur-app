import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { formatPeriodRange, formatShortRange } from '../lib/format'
import type { AnalyticsPeriod } from '../lib/period'

/**
 * The head of the printed report, shared by both networks' documents.
 *
 * It is also the colour key: the two swatches here are the ones every legend below echoes, so
 * they must be the same two marks on both documents or the key stops meaning anything. That is
 * the reason this is one component rather than two that happen to match — a masthead written
 * twice is a colour key that can drift.
 *
 * `note` is where a network says something about its own limits; only Facebook has one.
 */
export function ReportMasthead({
  clientName,
  networkLabel,
  accountName,
  period,
  note,
}: {
  clientName: string
  networkLabel: string
  /** The @handle or Page name, already in the form it should read. Hidden when absent. */
  accountName: string | null
  period: AnalyticsPeriod
  note?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 pb-5">
      <div>
        <div className="flex items-center gap-2.5">
          <Avatar name={clientName} size="sm" />
          <span className="text-title text-ink">{clientName}</span>
          {accountName && (
            <span className="text-micro text-text3">
              {networkLabel} · {accountName}
            </span>
          )}
        </div>
        {/* The sticky page header carries the screen title; print has no header. */}
        <h2 className="mt-2 hidden text-headline text-ink print:block">Analytics</h2>
        {/* The masthead IS the color key: every legend below echoes these two. */}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-body">
          <span className="flex items-center gap-2">
            <i aria-hidden="true" className="h-0.5 w-3.5 flex-none rounded-full bg-forest" />
            <span className="text-text2">
              <strong className="font-medium text-ink">This period</strong> ·{' '}
              {formatPeriodRange(period.start, period.end)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <i aria-hidden="true" className="h-0.5 w-3.5 flex-none rounded-full bg-metric-3" />
            <span className="text-text2">
              Previous · {formatShortRange(period.prevStart, period.prevEnd)}
            </span>
          </span>
        </p>
        <p className="mt-1 text-caption text-text3">
          Every number below compares the two — {period.days} days against the {period.days} before
          them.{note ? <> {note}</> : null}
        </p>
      </div>
    </header>
  )
}
