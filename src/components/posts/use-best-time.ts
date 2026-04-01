'use client'

import { useState, useEffect, useRef } from 'react'
import type { BestTimePlatform } from '@/types/api'

/**
 * Fetch best_time_json for a client from their brand profile.
 * Caches result per client ID to avoid re-fetching.
 */
export function useBestTime(clientId: string) {
  const [bestTimeData, setBestTimeData] = useState<BestTimePlatform[] | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!clientId || fetchedRef.current === clientId) return
    fetchedRef.current = clientId
    setLoading(true)

    void fetch(`/api/clients/${clientId}`)
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as {
          client: Record<string, unknown>
          brand_profile?: { best_time_json?: BestTimePlatform[] | null }
        }
        const btj = data.brand_profile?.best_time_json
        if (Array.isArray(btj)) setBestTimeData(btj)
      })
      .catch(() => {
        // best-time fetch is non-critical
      })
      .finally(() => setLoading(false))
  }, [clientId])

  return { bestTimeData, loading }
}
