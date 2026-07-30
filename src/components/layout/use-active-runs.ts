'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ActiveRun } from '@/types/api'

/** How often to re-check while something is composing. */
const POLL_INTERVAL_MS = 8_000

/**
 * Tracks generation batches in flight. Polls only while a run is live, so an
 * idle dashboard issues no requests; a run started elsewhere (cron) is picked
 * up when the tab regains focus.
 *
 * Owned by the Sidebar rather than by the card that displays it: the rail and
 * the mobile drawer both render that card, and a collapsed rail hides it — none
 * of which should start, stop, or duplicate the polling.
 */
export function useActiveRuns(initialRuns: ActiveRun[]): ActiveRun[] {
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

  return runs
}
