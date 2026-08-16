'use client'

import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'

interface BusyHintProps {
  /** What is running, in the user's words: "Repairing the backdrop". */
  label: string
  /** Roughly how long this model usually takes, in seconds — sets expectations before the wait. */
  typicalSeconds?: number
}

/**
 * The honest wait: a spinner plus the seconds actually elapsed. These models take up to a minute
 * and report no progress, so a bare spinner leaves people wondering whether it is stuck.
 */
export function BusyHint({ label, typicalSeconds }: BusyHintProps) {
  const elapsed = useElapsedSeconds()
  const overdue = typicalSeconds !== undefined && elapsed > typicalSeconds
  return (
    <div className="flex items-center gap-2 font-sans text-micro text-text2">
      <Spinner size="sm" />
      <span>
        {label} · <span className="tabular-nums">{elapsed}s</span>
        {overdue && ' · still going'}
      </span>
    </div>
  )
}

function useElapsedSeconds(): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])
  return elapsed
}
