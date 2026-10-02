import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createUserRecord } from '@/lib/auth/create-user-record'
import { SIGN_IN_PATH } from '@/utils/constants'
import { InviteHandler } from './invite-handler'

/**
 * Where an emailed auth link lands. A PKCE code (signup confirmation, password reset) is exchanged
 * for a session: a reset goes on to set its new password; any other login is provisioned by
 * `createUserRecord` (src/lib/auth/create-user-record.ts), which is the one check for an existing
 * row and writes nothing for one, and an invitee goes on to set a password, everyone else to the
 * dashboard. A failed exchange (an expired link) opens the sign-in dialog with the reason in
 * `error`, so the visitor is told why rather than shown a blank form. With no code, the link is an
 * invite whose session rides in the URL hash, which only the browser can read (`InviteHandler`).
 */
export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const code = typeof params.code === 'string' ? params.code : null
  const type = typeof params.type === 'string' ? params.type : null

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      if (type === 'recovery') {
        redirect('/setup-password')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { isInvited } = await createUserRecord(createAdminSupabaseClient(), {
          id: user.id,
          email: user.email ?? '',
          user_metadata: user.user_metadata ?? {},
        })
        redirect(isInvited ? '/setup-password' : '/dashboard')
      }
    }

    redirect(`${SIGN_IN_PATH}&error=confirmation_failed`)
  }

  return <InviteHandler />
}
