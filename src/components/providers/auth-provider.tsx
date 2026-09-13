'use client'

import { useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { SIGN_IN_PATH } from '@/utils/constants'

/**
 * Listens for Supabase auth state changes and sends a signed-out browser to the sign-in dialog.
 *
 * This is the ONE navigation that follows a sign-out: `signOut()` emits SIGNED_OUT before it
 * resolves, so whatever called it must not navigate as well — a second navigation only races
 * this one. The same listener covers a session that ends elsewhere (another tab, an expired
 * refresh token). Initial user/agency data is resolved server-side in the dashboard layout — no
 * client-side Supabase queries on mount.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createBrowserSupabaseClient()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.href = SIGN_IN_PATH
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
