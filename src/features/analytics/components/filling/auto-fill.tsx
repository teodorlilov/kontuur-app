'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PLATFORM_NAMES } from '@/lib/validation'
import { fillPeriodData } from '../../actions/report-actions'
import type { AnalyticsPeriod } from '../../lib/compute/period'

/**
 * Mounted only when the selected window has days never asked of Meta. Selecting a period IS
 * the request for that period's data — there is no fetch button anywhere in this document.
 */
export function AutoFill({
  clientId,
  period,
  unfilledDays,
  network = 'instagram',
  networkLabel = PLATFORM_NAMES.instagram,
}: {
  clientId: string
  period: AnalyticsPeriod
  unfilledDays: number
  /** Which network's window this fill asks for; the action dispatches on it. */
  network?: 'instagram' | 'facebook'
  networkLabel?: string
}) {
  const router = useRouter()
  const firedFor = useRef<string | null>(null)
  // One fill per window-and-count (strict-mode double-mounts included). Deep
  // windows chain: each completed run refreshes the page, the count drops, the
  // new key fires the next run. A run that moves nothing produces the same key
  // and the chain stops — guaranteed termination.
  const key = `${clientId}:${network}:${period.start}:${period.end}:${unfilledDays}`
  // Carries its key rather than being cleared when the key changes: a synchronous reset
  // inside the effect is what `react-hooks/set-state-in-effect` forbids, and "belongs to a
  // run that is no longer current" is answerable at render time anyway.
  const [stalled, setStalled] = useState<{ key: string; kind: 'throttled' | 'failed' } | null>(null)

  useEffect(() => {
    if (firedFor.current === key) return
    firedFor.current = key
    void fillPeriodData({
      clientId,
      preset: period.preset,
      start: period.start,
      end: period.end,
      network,
    }).then((result) => {
      if (!result.ok) return setStalled({ key, kind: 'failed' })
      if (result.data.filled) return router.refresh()
      // Nothing landed and re-running will not help. Saying which is what stops the reader
      // watching a silhouette that has quietly stopped advancing.
      if (result.data.stalled) {
        setStalled({ key, kind: result.data.rateLimited ? 'throttled' : 'failed' })
      }
    })
  }, [key, clientId, network, period.preset, period.start, period.end, router])

  if (stalled?.key !== key) return null
  return (
    <p role="status" className="mt-2 text-center text-caption text-pending">
      {stalled.kind === 'throttled'
        ? `${networkLabel} is rate-limiting this account — the rest of this window fills tonight.`
        : `This window could not be completed from ${networkLabel} just now — it retries tonight.`}
    </p>
  )
}
