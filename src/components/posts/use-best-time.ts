'use client'

import { useState, useEffect } from 'react'
import type { BestTimePlatform } from '@/lib/scheduling/schemas'

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
  // Seeded from the argument rather than set to true inside the effect: a fetch is pending from
  // the first render onward, so starting at false only to flip it in the effect renders one frame
  // that claims otherwise and forces an immediate second pass.
  const [loading, setLoading] = useState(() => Boolean(clientId))

  useEffect(() => {
    if (!clientId) return
    let active = true

    void fetchBestTime(clientId)
      .then((data) => {
        // The cache is module-level and shared, so a resolution can arrive after this consumer
        // switched clients or unmounted.
        if (active) setBestTimeData(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [clientId])

  return { bestTimeData, loading }
}
