'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fillPeriodData } from '../actions/report-actions'
import type { AnalyticsPeriod } from '../lib/period'

/**
 * Mounted only when the selected window has days never asked of Meta: fires
 * the fill once, then re-renders the page when it lands. This is what makes
 * a period filter behave like the Instagram app — selecting a window IS the
 * request for that window's data; no button in between.
 */
export function AutoFill({
  clientId,
  period,
  unfilledDays,
}: {
  clientId: string
  period: AnalyticsPeriod
  unfilledDays: number
}) {
  const router = useRouter()
  const firedFor = useRef<string | null>(null)
  // One fill per window-and-count (strict-mode double-mounts included). Deep
  // windows chain: each completed run refreshes the page, the count drops, the
  // new key fires the next run. A run that moves nothing produces the same key
  // and the chain stops — guaranteed termination.
  const key = `${clientId}:${period.start}:${period.end}:${unfilledDays}`
  // Carries its key rather than being cleared when one changes: a synchronous
  // reset inside the effect is the cascading render the lint rule names, and
  // "belongs to a run that is no longer current" is a render-time question.
  const [stalled, setStalled] = useState<{ key: string; kind: 'throttled' | 'failed' } | null>(null)

  useEffect(() => {
    if (firedFor.current === key) return
    firedFor.current = key
    void fillPeriodData({
      clientId,
      preset: period.preset,
      start: period.start,
      end: period.end,
    }).then((result) => {
      if (!result.ok) return setStalled({ key, kind: 'failed' })
      if (result.data.filled) return router.refresh()
      // Nothing landed and re-running will not help: say which, so the reader
      // is not left watching a silhouette that has stopped advancing. The
      // outcome used to be discarded here, which is how that happened.
      if (result.data.stalled) {
        setStalled({ key, kind: result.data.rateLimited ? 'throttled' : 'failed' })
      }
    })
  }, [key, clientId, period.preset, period.start, period.end, router])

  if (stalled?.key !== key) return null
  return (
    <p role="status" className="mt-2 text-center text-caption text-pending">
      {stalled.kind === 'throttled'
        ? 'Instagram is rate-limiting this account — the rest of this window fills tonight.'
        : 'This window could not be completed from Instagram just now — it retries tonight.'}
    </p>
  )
}
