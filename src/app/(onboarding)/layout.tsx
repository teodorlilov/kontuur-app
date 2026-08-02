import { redirect } from 'next/navigation'
import { getAuthUserId } from '@/lib/auth/session'
import { AuthProvider } from '@/components/providers/auth-provider'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthUserId()
  if (!userId) redirect('/login')

  return (
    <AuthProvider>
      <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>{children}</div>
    </AuthProvider>
  )
}
