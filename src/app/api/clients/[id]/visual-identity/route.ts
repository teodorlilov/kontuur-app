import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchVisualIdentityOrDefault } from '@/lib/visual/queries'

/** The client's visual identity (palette + brand style) — seeds draft canvas docs in the wizard. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const { data: client } = await auth.supabase
    .from('clients')
    .select('id')
    .eq('id', id)
    .eq('agency_id', auth.agencyId)
    .single()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const identity = await fetchVisualIdentityOrDefault(id)
  return NextResponse.json({ identity: { palette: identity.palette, style: identity.style } })
}
