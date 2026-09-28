'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { SIGN_IN_PATH } from '@/utils/constants'

/**
 * An invite link's landing: the session arrives in the URL hash, is set in the browser, and the
 * invitee goes to /setup-password, which makes them a member (`provisionUserRecord`,
 * src/lib/auth/provision-user-record.ts) before they choose a password. A link without a session
 * goes to sign-in.
 */
export function InviteHandler() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleInvite() {
      const hash = window.location.hash
      if (!hash || !hash.includes('access_token')) {
        router.replace(SIGN_IN_PATH)
        return
      }

      const params = new URLSearchParams(hash.substring(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (!accessToken || !refreshToken) {
        router.replace(SIGN_IN_PATH)
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

      router.replace('/setup-password')
    }

    void handleInvite()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-sunken px-4">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-danger mb-4">{error}</p>
            <a href={SIGN_IN_PATH} className="text-forest hover:underline text-body">
              Back to login
            </a>
          </>
        ) : (
          <p className="text-text3">Setting up your account…</p>
        )}
      </div>
    </div>
  )
}
