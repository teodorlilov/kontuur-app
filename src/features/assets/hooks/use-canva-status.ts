import { useState, useEffect } from 'react'

/** Module-level cache so remounts don't flash gray. */
let cachedStatus: boolean | null = null

/**
 * Checks whether the current logged-in user has a connected Canva account.
 * Connection is at the user (manager) level, not per-client.
 */
export function useCanvaStatus(): boolean {
  const [connected, setConnected] = useState(cachedStatus ?? false)

  useEffect(() => {
    if (cachedStatus !== null) return
    fetch('/api/canva/status')
      .then((r) => r.json())
      .then((data: { connected?: boolean }) => {
        cachedStatus = data.connected ?? false
        setConnected(cachedStatus)
      })
      .catch(() => {
        cachedStatus = false
        setConnected(false)
      })
  }, [])

  return connected
}
