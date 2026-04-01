'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'
import type { User } from '@supabase/supabase-js'

type Agency = Database['public']['Tables']['agencies']['Row']
type AgencyUser = Database['public']['Tables']['users']['Row']

interface AuthContextValue {
  user: User | null
  agency: Agency | null
  agencyUser: AgencyUser | null
  agencyMode: 'agency' | 'solo'
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  agency: null,
  agencyUser: null,
  agencyMode: 'agency',
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [agency, setAgency] = useState<Agency | null>(null)
  const [agencyUser, setAgencyUser] = useState<AgencyUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()

    async function loadSession() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (!currentUser) {
        setLoading(false)
        return
      }

      setUser(currentUser)

      const { data: userData } = await supabase
        .from('users')
        .select('id, agency_id, email, role, created_at')
        .eq('id', currentUser.id)
        .single()

      if (!userData) {
        setLoading(false)
        return
      }

      setAgencyUser(userData as AgencyUser)

      const { data: agencyData } = await supabase
        .from('agencies')
        .select('id, name, plan, mode, agency_logo, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, plan_client_limit, created_at')
        .eq('id', userData.agency_id)
        .single()

      setAgency((agencyData as Agency | null) ?? null)
      setLoading(false)
    }

    loadSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
        setAgency(null)
        setAgencyUser(null)
      }
      loadSession()
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const agencyMode: 'agency' | 'solo' = agency?.mode === 'solo' ? 'solo' : 'agency'

  return (
    <AuthContext.Provider value={{ user, agency, agencyUser, agencyMode, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
