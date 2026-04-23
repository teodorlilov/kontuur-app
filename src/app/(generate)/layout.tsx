import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { AuthProvider } from '@/components/providers/auth-provider'

export default async function GenerateLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  return (
    <AuthProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F4EFE6' }}>
        {children}
      </div>
    </AuthProvider>
  )
}
