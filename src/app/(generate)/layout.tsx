import { redirect } from 'next/navigation'
import { getAuthUserId } from '@/lib/auth/session'
import { AuthProvider } from '@/components/providers/auth-provider'

export default async function GenerateLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthUserId()
  if (!userId) redirect('/login')

  return (
    <AuthProvider>
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--paper)',
        }}
      >
        {children}
      </div>
    </AuthProvider>
  )
}
