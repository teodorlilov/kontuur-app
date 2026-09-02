'use client'

import { useEffect, useRef, useState } from 'react'
import type { VisualIdentity } from '@/types/visual'

export type ExtractionStatus = 'idle' | 'pending' | 'ready' | 'fallback' | 'failed'

/**
 * What each state means to a person, in one place.
 *
 * Lives beside the type rather than in a component because two surfaces read it — the settings
 * panel and the onboarding draft sheet — and two copies of this wording would drift.
 */
export const EXTRACTION_HINT: Partial<Record<ExtractionStatus, string>> = {
  pending: 'Reading the site for brand colours — you can keep editing; results land here.',
  failed: 'Reading the colours took too long. These are defaults — adjust anything below.',
  fallback: 'No colours could be read from the site. These are defaults — adjust below.',
}

type UseExtractionStatusArgs = {
  sessionId: string
  enabled: boolean
  onResolved: (identity: VisualIdentity) => void
}

// Give up after this long and treat it as a fallback, so the UI never spins forever if the async
// extraction never writes a terminal status (e.g. a cold Chromium OOM/timeout on the server).
const POLL_TIMEOUT_MS = 90_000

/**
 * Poll `/api/extract/status` while async brand extraction runs, calling `onResolved` once the measured
 * (or fallback) identity lands. Stops as soon as it resolves — or after a hard timeout, flipping to
 * `failed` so callers can settle on the placeholder identity. Safe to keep mounted.
 */
export function useExtractionStatus({ sessionId, enabled, onResolved }: UseExtractionStatusArgs): {
  status: ExtractionStatus
} {
  const [status, setStatus] = useState<ExtractionStatus>('idle')
  // Kept current in an effect, not during render: a render React discards can still mutate a ref,
  // leaving the committed tree holding a callback from an abandoned render.
  const onResolvedRef = useRef(onResolved)
  useEffect(() => {
    onResolvedRef.current = onResolved
  })

  useEffect(() => {
    if (!enabled || !sessionId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const deadline = Date.now() + POLL_TIMEOUT_MS

    const schedule = () => {
      timer = setTimeout(() => void poll(), 2500)
    }

    async function poll() {
      if (Date.now() > deadline) {
        setStatus('failed')
        return
      }
      try {
        const res = await fetch(`/api/extract/status?session=${encodeURIComponent(sessionId)}`)
        if (!active) return
        if (!res.ok) return schedule()
        const data = (await res.json()) as {
          status: ExtractionStatus
          identity: VisualIdentity | null
        }
        if (!active) return
        if ((data.status === 'ready' || data.status === 'fallback') && data.identity) {
          setStatus(data.status)
          onResolvedRef.current(data.identity)
          return
        }
        setStatus(data.status)
        schedule()
      } catch {
        if (active) schedule()
      }
    }

    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [sessionId, enabled])

  return { status }
}
