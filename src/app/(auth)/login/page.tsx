import { redirect } from 'next/navigation'

/**
 * Sign-in is a dialog over the landing page now.
 *
 * The route survives as a redirect rather than being deleted, because eleven
 * places still send people here — every `redirect('/login')` behind an
 * unauthenticated page, the sign-out in the sidebar, the auth provider's
 * session watcher, and the invite handler — and Supabase's own email templates
 * are configured against these paths.
 */
export default function LoginPage() {
  redirect('/?auth=signin')
}
