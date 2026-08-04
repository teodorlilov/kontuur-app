import { redirect } from 'next/navigation'
import { getAuthUserId } from '@/lib/auth/session'
import { AuthProvider } from '@/components/providers/auth-provider'
import { ContourField } from '@/components/layout/contour-field'

export default async function GenerateLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthUserId()
  if (!userId) redirect('/login')

  return (
    <AuthProvider>
      {/* The relative, non-scrolling box ContourField needs — the field draws
          the ground, the flow's own scroll area sits above it at z-[1], and
          the terrain stops at each sheet's edge (cards are clearings). */}
      <div className="relative flex h-dvh flex-col overflow-hidden bg-paper">
        <ContourField />
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </AuthProvider>
  )
}
