import { redirect } from 'next/navigation'
import { SIGN_UP_PATH } from '@/utils/constants'

/** Sign-up is a dialog over the landing page. See `(auth)/login/page.tsx`. */
export default function SignupPage() {
  redirect(SIGN_UP_PATH)
}
