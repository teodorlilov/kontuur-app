'use client'

import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    // One fill per window-and-count (strict-mode double-mounts included).
    // Deep windows chain: each completed run refreshes the page, the count
    // drops, the new key fires the next run. A run that moves nothing
    // produces the same key and the chain stops — guaranteed termination.
    const key = `${clientId}:${period.start}:${period.end}:${unfilledDays}`
    if (firedFor.current === key) return
    firedFor.current = key
    void fillPeriodData({
      clientId,
      preset: period.preset,
      start: period.start,
      end: period.end,
    }).then((result) => {
      if (result.ok && result.data.filled) router.refresh()
    })
  }, [clientId, period.preset, period.start, period.end, unfilledDays, router])

  return null
}
