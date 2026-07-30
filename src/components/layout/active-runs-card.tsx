'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import type { ActiveRun } from '@/types/api'

/** How often to re-check while something is composing. */
const POLL_INTERVAL_MS = 8_000

interface ActiveRunsCardProps {
  initialRuns: ActiveRun[]
}

/**
 * "Composing drafts" indicator. Polls only while a run is in flight, so an idle
 * dashboard issues no requests; a run started elsewhere (cron) is picked up when
 * the tab regains focus.
 */
export function ActiveRunsCard({ initialRuns }: ActiveRunsCardProps) {
  const router = useRouter()
  const [runs, setRuns] = useState(initialRuns)
  const [serverRuns, setServerRuns] = useState(initialRuns)
  const hadRunsRef = useRef(initialRuns.length > 0)

  // A fresh server render is authoritative — adopt it during render rather than
  // syncing props into state from an effect.
  if (initialRuns !== serverRuns) {
    setServerRuns(initialRuns)
    setRuns(initialRuns)
  }

  const refresh = useCallback(async () => {
    let next: ActiveRun[]
    try {
      const response = await fetch('/api/generation/active')
      if (!response.ok) return
      const payload: { runs?: ActiveRun[] } = await response.json()
      next = payload.runs ?? []
    } catch {
      // A dropped poll is not worth surfacing — the next tick reconciles.
      return
    }

    setRuns(next)

    // A batch just finished: pull the server-rendered counts back in step.
    if (hadRunsRef.current && next.length === 0) router.refresh()
    hadRunsRef.current = next.length > 0
  }, [router])

  useEffect(() => {
    function handleFocus() {
      void refresh()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refresh])

  useEffect(() => {
    if (runs.length === 0) return
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [runs.length, refresh])

  if (runs.length === 0) return null

  const [run] = runs
  if (!run) return null

  const label = runs.length > 1 ? `${runs.length} clients` : run.clientName
  const progress = run.targetCount > 0 ? Math.min(run.doneCount / run.targetCount, 1) : 0
  const detail =
    run.doneCount > 0 && run.targetCount > 0
      ? `${run.doneCount} of ${run.targetCount} posts for ${label}`
      : `Researching for ${label}`

  return (
    <div
      className="mx-2.5 mb-3 rounded-panel border border-spring/20 p-3"
      style={{ background: 'var(--surface-live)' }}
    >
      <div className="flex items-center gap-[7px] text-[12px] font-medium text-ink">
        <span className="live-dot size-1.5 shrink-0 rounded-full bg-spring" />
        Composing drafts
      </div>
      <div className="mt-[3px] text-[11px] text-text3">
        {detail} · {formatRelativeTime(parseTimestamp(run.startedAt))}
      </div>
      <div className="mt-2.5 h-[3px] overflow-hidden rounded-sm bg-forest/10">
        {progress > 0 ? (
          <span
            className="block h-full rounded-sm bg-spring transition-[width] duration-500 ease-contour"
            style={{ width: `${progress * 100}%` }}
          />
        ) : (
          <span className="live-sweep block h-full w-2/5 rounded-sm bg-spring" />
        )}
      </div>
    </div>
  )
}
