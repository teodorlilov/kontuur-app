'use client'

import { useEffect, useRef, useState } from 'react'
import type { VisualIdentity } from '@/types/visual'

export type ExtractionStatus = 'idle' | 'pending' | 'ready' | 'fallback' | 'failed'

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
  const onResolvedRef = useRef(onResolved)
  onResolvedRef.current = onResolved

  useEffect(() => {
    if (!enabled || !sessionId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const deadline = Date.now() + POLL_TIMEOUT_MS

    const schedule = () => {
      timer = setTimeout(poll, 2500)
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
        const data = (await res.json()) as { status: ExtractionStatus; identity: VisualIdentity | null }
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

    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [sessionId, enabled])

  return { status }
}
