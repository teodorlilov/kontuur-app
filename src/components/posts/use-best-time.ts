'use client'

import { useState, useEffect } from 'react'
import type { BestTimePlatform } from '@/types/api'

// Module-level promise cache — concurrent calls for the same clientId share one in-flight request
const cache = new Map<string, Promise<BestTimePlatform[] | null>>()

function fetchBestTime(clientId: string): Promise<BestTimePlatform[] | null> {
  if (!cache.has(clientId)) {
    cache.set(
      clientId,
      fetch(`/api/clients/${clientId}`)
        .then(async (res) => {
          if (!res.ok) return null
          const data = (await res.json()) as {
            brand_profile?: { best_time_json?: BestTimePlatform[] | null }
          }
          const btj = data.brand_profile?.best_time_json
          return Array.isArray(btj) ? btj : null
        })
        .catch(() => null)
    )
  }
  return cache.get(clientId)!
}

/**
 * Fetch best_time_json for a client from their brand profile.
 * Module-level promise cache ensures all instances for the same clientId share one request.
 */
export function useBestTime(clientId: string) {
  const [bestTimeData, setBestTimeData] = useState<BestTimePlatform[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clientId) return
    setLoading(true)
    void fetchBestTime(clientId)
      .then(setBestTimeData)
      .finally(() => setLoading(false))
  }, [clientId])

  return { bestTimeData, loading }
}
