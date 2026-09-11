'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PLATFORM_NAMES } from '@/lib/validation'
import { fillPeriodData } from '../../actions/report-actions'
import type { AnalyticsPeriod } from '../../lib/compute/period'

/**
 * Mounted only when the selected window has days never asked of Meta. Selecting a period IS
 * the request for that period's data — there is no fetch button anywhere in this document.
 *
 * One fill per window-and-count key (strict-mode double-mounts included), which is also how
 * deep windows chain: a completed run refreshes the page, the count drops, the new key fires
 * the next run — and a run that moves nothing produces the same key, so the chain terminates.
 *
 * `stalled` carries the key it belongs to instead of being cleared when the key changes: a
 * synchronous reset inside the effect is what `react-hooks/set-state-in-effect` forbids, and
 * "belongs to a run that is no longer current" is answerable at render time anyway.
 * A `retired` outcome refreshes like a filled one — the server renders the disconnected state.
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
  const key = `${clientId}:${network}:${period.start}:${period.end}:${unfilledDays}`
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
    })
      .then((result) => {
        if (!result.ok) return setStalled({ key, kind: 'failed' })
        if (result.data.filled || result.data.retired) return router.refresh()
        if (result.data.stalled) {
          setStalled({ key, kind: result.data.rateLimited ? 'throttled' : 'failed' })
        }
      })
      .catch(() => setStalled({ key, kind: 'failed' }))
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
