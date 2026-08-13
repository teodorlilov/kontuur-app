import { redirect } from 'next/navigation'

/** Sign-up is a dialog over the landing page. See `(auth)/login/page.tsx`. */
export default function SignupPage() {
  redirect('/?auth=signup')
}
