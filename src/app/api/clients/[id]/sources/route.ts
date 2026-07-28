import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { CLIENT_SOURCE_COLUMNS } from '@/lib/queries/select-columns'
import type { ClientSource } from '@/types/api'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('client_sources')
    .select(CLIENT_SOURCE_COLUMNS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cast through unknown — pillar_ids column added by migration, not yet in generated Supabase types
  return NextResponse.json({ sources: data as unknown as ClientSource[] })
}
