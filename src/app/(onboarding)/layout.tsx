import { requireAuthUserId } from '@/lib/auth/session'
import { AuthProvider } from '@/components/providers/auth-provider'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireAuthUserId()

  // The ground is the shell's, not the layout's — OnboardingShell already owns the paper
  // background and the page column, so a second wrapper here only added a stray inline style.
  return <AuthProvider>{children}</AuthProvider>
}
