import { redirect } from 'next/navigation'
import { SIGN_IN_PATH } from '@/utils/constants'

/**
 * Sign-in is a dialog over the landing page.
 *
 * This route is an entry point for links that live outside the app — old bookmarks, and auth
 * emails configured in the Supabase dashboard. Nothing inside the app sends anyone here: every
 * in-app sender uses `SIGN_IN_PATH` directly, so this hop is paid only by an external link.
 */
export default function LoginPage() {
  redirect(SIGN_IN_PATH)
}
