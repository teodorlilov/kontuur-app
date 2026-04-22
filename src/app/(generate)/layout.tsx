import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { AuthProvider } from '@/components/providers/auth-provider'

export default async function GenerateLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  return (
    <AuthProvider>
      <div style={{ minHeight: '100vh', background: 'var(--color-page)' }}>{children}</div>
    </AuthProvider>
  )
}
