import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchVisualIdentity } from '@/lib/visual/queries'

/** Return a client's stored visual identity (palette + typography + vibe preset) for client-side rendering
 *  of composed slides. Agency-ownership checked. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const identity = await fetchVisualIdentity(id)
  return NextResponse.json({ identity })
}
