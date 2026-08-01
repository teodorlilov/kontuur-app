'use client'

import { useCallback, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Keeps a `TabRail`'s active tab in the `?tab=` query string.
 *
 * `history.replaceState`, not `router.replace`: on the App Router the latter re-runs the page's
 * server component — a dozen queries on the client settings page — on every tab click.
 *
 * `isAllowed` rejects a tab that exists but is hidden for this workspace.
 */
export function useTabParam<T extends string>(
  tabs: ReadonlyArray<{ id: T }>,
  fallback: T,
  isAllowed: (tab: T) => boolean = () => true
): [T, (tab: T) => void] {
  const searchParams = useSearchParams()

  const [activeTab, setActiveTab] = useState<T>(() => {
    const fromUrl = tabs.find((tab) => tab.id === searchParams.get('tab'))?.id
    return fromUrl && isAllowed(fromUrl) ? fromUrl : fallback
  })

  const selectTab = useCallback((tab: T) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', url)
  }, [])

  return [activeTab, selectTab]
}
