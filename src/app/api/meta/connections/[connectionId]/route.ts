import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  // Verify the connection belongs to a client owned by this agency
  const { data: connection } = await supabase
    .from('social_connections')
    .select('id, client_id, clients!inner(agency_id)')
    .eq('id', connectionId)
    .single() as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }

  if (!connection) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (connection.clients.agency_id !== agencyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('social_connections')
    .delete()
    .eq('id', connectionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
