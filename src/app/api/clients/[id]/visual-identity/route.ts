import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchVisualIdentityOrDefault } from '@/lib/visual/queries'
import { toSeedIdentity } from '@/lib/visual/identity-schema'

/** The client's visual identity (palette + brand style) — seeds draft canvas docs in the wizard. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  // `name` rides along on the row this lookup already fetches for the agency check — the `quote`
  // lockup signs its pull-quote with it, and without it that layout prints a placeholder.
  const { data: client } = await auth.supabase
    .from('clients')
    .select('id, name')
    .eq('id', id)
    .eq('agency_id', auth.agencyId)
    .single()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const identity = await fetchVisualIdentityOrDefault(id)
  return NextResponse.json({ identity: toSeedIdentity(identity, client.name) })
}
