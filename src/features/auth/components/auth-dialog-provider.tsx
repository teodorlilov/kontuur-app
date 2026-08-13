'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AuthDialog } from './auth-dialog'

/** Which face the auth dialog is showing. `null` means it is closed. */
export type AuthView = 'signin' | 'signup' | 'reset' | 'sent'

interface AuthDialogContextValue {
  view: AuthView | null
  open: (view: AuthView) => void
  close: () => void
}

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null)

/** Opens and closes the sign-in / sign-up dialog from anywhere on the landing page. */
export function useAuthDialog(): AuthDialogContextValue {
  const value = useContext(AuthDialogContext)
  if (!value) throw new Error('useAuthDialog must be used inside AuthDialogProvider')
  return value
}

interface AuthDialogProviderProps {
  /** From `?auth=` — how `/login`, `/signup` and `/forgot-password` now arrive. */
  initialView?: AuthView
  /** From `?error=` — the only thing /auth/callback can tell the visitor. */
  initialError?: string
  children: React.ReactNode
}

/**
 * Holds the auth dialog for the landing page.
 *
 * The retired `/login`, `/signup` and `/forgot-password` routes redirect here
 * with `?auth=…`, which is why the opening view arrives as a prop rather than
 * being read from the client: the server already knows it, and passing it down
 * avoids a Suspense boundary around the whole page for one search param.
 */
export function AuthDialogProvider({
  initialView,
  initialError,
  children,
}: AuthDialogProviderProps) {
  const [view, setView] = useState<AuthView | null>(initialView ?? null)

  const close = useCallback(() => {
    setView(null)
    // Drop ?auth= / ?error= so a refresh does not reopen a dialog the visitor
    // just dismissed. replaceState rather than the router: this is a URL tidy-up,
    // not a navigation, and it must not re-render the page underneath.
    const url = new URL(window.location.href)
    if (url.searchParams.has('auth') || url.searchParams.has('error')) {
      url.searchParams.delete('auth')
      url.searchParams.delete('error')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [])

  const value = useMemo(() => ({ view, open: setView, close }), [view, close])

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      <AuthDialog view={view} initialError={initialError} />
    </AuthDialogContext.Provider>
  )
}
