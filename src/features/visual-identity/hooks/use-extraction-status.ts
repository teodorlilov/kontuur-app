'use client'

import { useEffect, useRef, useState } from 'react'
import type { VisualIdentity } from '@/types/visual'

export type ExtractionStatus = 'idle' | 'pending' | 'ready' | 'fallback' | 'failed'

type UseExtractionStatusArgs = {
  sessionId: string
  enabled: boolean
  onResolved: (identity: VisualIdentity) => void
}

/**
 * Poll `/api/extract/status` while async brand extraction runs, calling `onResolved` once the measured
 * (or fallback) identity lands. Stops polling as soon as it resolves; safe to keep mounted.
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

    const schedule = () => {
      timer = setTimeout(poll, 2500)
    }

    async function poll() {
      try {
        const res = await fetch(`/api/extract/status?session=${encodeURIComponent(sessionId)}`)
        if (!active) return
        if (!res.ok) return schedule()
        const data = (await res.json()) as { status: ExtractionStatus; identity: VisualIdentity | null }
        if (!active) return
        setStatus(data.status)
        if ((data.status === 'ready' || data.status === 'fallback') && data.identity) {
          onResolvedRef.current(data.identity)
          return
        }
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
