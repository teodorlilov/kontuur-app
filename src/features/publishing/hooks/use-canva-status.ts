import { useState, useEffect } from 'react'

/**
 * Checks whether the current logged-in user has a connected Canva account.
 * Connection is at the user (manager) level, not per-client.
 */
export function useCanvaStatus(): boolean {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    fetch('/api/canva/status')
      .then((r) => r.json())
      .then((data: { connected?: boolean }) => {
        setConnected(data.connected ?? false)
      })
      .catch(() => setConnected(false))
  }, [])

  return connected
}
