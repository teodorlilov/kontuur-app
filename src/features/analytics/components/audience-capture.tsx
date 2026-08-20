'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureAudienceSnapshot } from '../actions/report-actions'
import type { AnalyticsPeriod } from '../lib/period'

/**
 * The audience section's self-healing empty state. Demographics are the one
 * part of the document a period filter cannot produce — they come from a
 * snapshot, and the window refill only asks Meta for days. Rather than telling
 * the reader to wait for tonight's sync, this asks for the snapshot now and
 * re-renders when it lands. One attempt per mount; the action is cadence-gated
 * server-side, so nothing here can spend the eight breakdown calls twice.
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
