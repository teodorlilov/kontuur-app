'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureAudienceSnapshot } from '../../actions/report-actions'
import type { AnalyticsPeriod } from '../../lib/compute/period'

/**
 * The audience section's self-healing empty state. Demographics are the one part of the
 * document a period filter cannot produce — they come from a snapshot, while the window
 * refill only asks Meta for days.
 *
 * Safe to fire on mount because the server action is cadence-gated: `syncDemographicsWeekly`
 * returns early if a snapshot for this account is under a week old, so a reload cannot spend
 * the eight breakdown calls (two kinds × age/gender/city/country) a second time.
 */
export function AudienceCapture({
  clientId,
  period,
}: {
  clientId: string
  period: AnalyticsPeriod
}) {
  const router = useRouter()
  const asked = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (asked.current) return
    asked.current = true
    void ensureAudienceSnapshot({
      clientId,
      preset: period.preset,
      start: period.start,
      end: period.end,
    }).then((result) => {
      if (result.ok && result.data.captured) router.refresh()
      else setFailed(true)
    })
  }, [clientId, period.preset, period.start, period.end, router])

  return (
    <p className="mt-4 text-caption text-text3" role="status">
      {failed
        ? 'Instagram did not return audience demographics — the nightly sync tries again.'
        : 'Capturing your audience from Instagram…'}
    </p>
  )
}
