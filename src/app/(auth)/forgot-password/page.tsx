import { redirect } from 'next/navigation'

/** Password reset is a dialog over the landing page. See `(auth)/login/page.tsx`. */
export default function ForgotPasswordPage() {
  redirect('/?auth=reset')
}
