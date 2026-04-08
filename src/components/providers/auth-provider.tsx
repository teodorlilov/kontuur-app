'use client'

import { useEffect } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

/**
 * Listens for Supabase auth state changes and redirects to /login on sign-out.
 * Initial user/agency data is resolved server-side in the dashboard layout —
 * no client-side Supabase queries are needed on mount.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createBrowserSupabaseClient()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.href = '/login'
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return <>{children}</>
}
