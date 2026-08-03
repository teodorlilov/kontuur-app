import { redirect } from 'next/navigation'
import { getAuthUserId } from '@/lib/auth/session'
import { AuthProvider } from '@/components/providers/auth-provider'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthUserId()
  if (!userId) redirect('/login')

  // The ground is the shell's, not the layout's — OnboardingShell already owns the paper
  // background and the page column, so a second wrapper here only added a stray inline style.
  return <AuthProvider>{children}</AuthProvider>
}
