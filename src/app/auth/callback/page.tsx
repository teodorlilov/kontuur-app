import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { InviteHandler } from './invite-handler'

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const code = typeof params.code === 'string' ? params.code : null
  const type = typeof params.type === 'string' ? params.type : null

  if (code) {
    // PKCE flow (signup, password reset)
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Password reset flow — send user to set their new password
      if (type === 'recovery') {
        redirect('/setup-password')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .single()

        if (!existingUser) {
          const admin = createAdminSupabaseClient()
          const result = await createUserRecord(admin, {
            id: user.id,
            email: user.email ?? '',
            user_metadata: (user.user_metadata ?? {}) as Record<string, unknown>,
          })

          if (result?.isInvited) {
            redirect('/setup-password')
          }
        }

        redirect('/dashboard')
      }
    }

    redirect('/login?error=confirmation_failed')
  }

  // No code param — implicit flow (invite link with hash fragment tokens).
  // Render client component to handle hash-based session.
  return <InviteHandler />
}
