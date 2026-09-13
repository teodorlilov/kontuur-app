import { redirect } from 'next/navigation'
import { RESET_PASSWORD_PATH } from '@/utils/constants'

/** Password reset is a dialog over the landing page. See `(auth)/login/page.tsx`. */
export default function ForgotPasswordPage() {
  redirect(RESET_PASSWORD_PATH)
}
