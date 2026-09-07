'use client'

import { createContext, useCallback, useContext, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/utils/cn'

/**
 * One transition shared between the period controls (in the sticky header)
 * and the document below them: switching a filter veils the old period's
 * data until the new one has fully rendered — stale numbers are never
 * presented as if they belonged to the freshly selected window.
 */

interface AnalyticsNav {
  pending: boolean
  navigate: (href: string) => void
}

const AnalyticsNavContext = createContext<AnalyticsNav | null>(null)

export function AnalyticsNavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const navigate = useCallback((href: string) => startTransition(() => router.push(href)), [router])
  return (
    <AnalyticsNavContext.Provider value={{ pending, navigate }}>
      {children}
    </AnalyticsNavContext.Provider>
  )
}

/** The period controls' navigation handle. Requires the provider. */
export function useAnalyticsNav(): AnalyticsNav {
  const nav = useContext(AnalyticsNavContext)
  if (!nav) throw new Error('useAnalyticsNav requires AnalyticsNavProvider')
  return nav
}

/** Veils the document while a period navigation is in flight. */
export function PendingVeil({ children }: { children: React.ReactNode }) {
  const nav = useContext(AnalyticsNavContext)
  const pending = nav?.pending ?? false
  return (
    <div aria-busy={pending} className="relative">
      <div
        className={cn(
          'transition-opacity duration-150',
          pending && 'pointer-events-none opacity-30 select-none'
        )}
      >
        {children}
      </div>
      {pending && (
        <div className="absolute inset-x-0 top-24 flex justify-center">
          <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-caption font-medium text-text2 shadow-pop">
            <span
              aria-hidden="true"
              className="live-dot size-1.5 flex-none rounded-full bg-spring"
            />
            Loading period…
          </span>
        </div>
      )}
    </div>
  )
}
