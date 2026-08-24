'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'
import { Spinner } from '@/components/ui/spinner'

interface BusyHintProps {
  /**
   * What is running, in the user's words: "Repairing the picture".
   *
   * Deliberately the call site's phrasing rather than the job's own label. The tray names the VERB
   * you pressed ("Repair a zone"); here, next to the canvas, the progressive reads better. What the
   * two surfaces must not disagree about is the numbers, and those come from the job.
   */
  label: string
  /** The job this is reporting on, when there is one — its start and estimate, not a second copy. */
  job?: { startedAt: number; typicalSeconds: number }
}

/**
 * The honest wait: a spinner, the seconds actually elapsed, and the estimate they are running
 * against. These models take up to a minute and report NOTHING in between — fal answers when it is
 * done — so every number here is measured or admitted to be a guess. Past the estimate the hint
 * stops predicting and says "still going" rather than inventing a percentage.
 */
export function BusyHint({ label, job }: BusyHintProps) {
  const { startedAt, typicalSeconds } = job ?? {}
  const elapsed = useElapsedSeconds(startedAt)
  const overdue = typicalSeconds !== undefined && elapsed > typicalSeconds
  return (
    <div className="flex items-center gap-2 font-sans text-micro text-text2">
      <Spinner size="sm" />
      <span>
        {label} · <span className="tabular-nums">{elapsed}s</span>
        {typicalSeconds !== undefined && !overdue && (
          <span className="tabular-nums"> of ~{typicalSeconds}s</span>
        )}
        {overdue && ' · still going'}
      </span>
    </div>
  )
}

/**
 * The same wait as a bar, for the tray — where several jobs are compared at a glance and a row of
 * digits is harder to scan than a row of lengths.
 *
 * It fills toward the estimate and STOPS there. An overdue job shows a full, striped track rather
 * than creeping to 99%: the editor genuinely does not know how much longer, and a bar that pretends
 * otherwise is the one thing people remember when it finally lands.
 */
export function BusyBar({
  startedAt,
  typicalSeconds,
}: {
  startedAt: number
  typicalSeconds: number
}) {
  const elapsed = useElapsedSeconds(startedAt)
  const overdue = elapsed > typicalSeconds
  const share = Math.min(1, elapsed / Math.max(1, typicalSeconds))
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="Elapsed against the typical time"
        aria-valuemin={0}
        aria-valuemax={typicalSeconds}
        aria-valuenow={elapsed}
        className="h-1 flex-1 overflow-hidden rounded-chip bg-sunken"
      >
        <div
          className={cn('h-full rounded-chip bg-forest', overdue && 'animate-pulse')}
          // The one thing a class cannot carry: a width that changes every second.
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <span className="shrink-0 font-sans text-micro tabular-nums text-text2">
        {overdue ? `${elapsed}s · still going` : `${elapsed}s of ~${typicalSeconds}s`}
      </span>
    </div>
  )
}

/**
 * Seconds since the work began.
 *
 * Counts from `startedAt` rather than from mount, so opening the tray thirty seconds into a job
 * shows thirty seconds — not zero. Without that the same job would report two different ages
 * depending on which surface you happened to be looking at.
 */
function useElapsedSeconds(startedAt?: number): number {
  // Mount time is the fallback origin, captured ONCE — reading "now" for both ends would make
  // every hint without an explicit start report a permanent zero.
  const [mountedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return Math.max(0, Math.round((now - (startedAt ?? mountedAt)) / 1000))
}
