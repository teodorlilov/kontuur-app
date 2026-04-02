'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

export function InviteHandler() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleInvite() {
      const hash = window.location.hash
      if (!hash || !hash.includes('access_token')) {
        router.replace('/login')
        return
      }

      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken || !refreshToken) {
        router.replace('/login')
        return
      }

      const supabase = createBrowserSupabaseClient()
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (sessionError) {
        setError('Failed to process invite. Please ask your admin to resend the invitation.')
        return
      }

      // Session established — redirect to password setup.
      // The dashboard layout will auto-create the user record on first visit.
      router.replace('/setup-password')
    }

    handleInvite()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-600 mb-4">{error}</p>
            <a href="/login" className="text-brand-purple hover:underline text-sm">
              Back to login
            </a>
          </>
        ) : (
          <p className="text-gray-500">Setting up your account…</p>
        )}
      </div>
    </div>
  )
}
