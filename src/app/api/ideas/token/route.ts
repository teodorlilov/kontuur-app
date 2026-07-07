import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { getOrCreateToken } from '@/features/ideas/lib/ideas'

/** POST — get or create an idea form token for a client. */
export async function POST(req: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const { clientId } = (await req.json()) as { clientId: string }

  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }

  const owned = await verifyClientOwnership(auth.supabase, clientId, auth.agencyId)
  if (!owned) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const token = await getOrCreateToken(auth.agencyId, clientId)
  return NextResponse.json({ token })
}
