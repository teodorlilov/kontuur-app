import { NextRequest, NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  // Verify the report belongs to a client owned by this agency
  const { data: reportWithClient } = await supabase
    .from('analytics_reports')
    .select('*, clients!inner(agency_id)')
    .eq('id', reportId)
    .single() as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }

  if (!reportWithClient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (reportWithClient.clients.agency_id !== agencyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Return report without the joined clients field
  const { clients: _clients, ...reportData } = reportWithClient
  return NextResponse.json({ report: reportData })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params

  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const { data: reportWithClient } = await supabase
    .from('analytics_reports')
    .select('id, clients!inner(agency_id)')
    .eq('id', reportId)
    .single() as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }

  if (!reportWithClient) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (reportWithClient.clients.agency_id !== agencyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('analytics_reports')
    .delete()
    .eq('id', reportId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
