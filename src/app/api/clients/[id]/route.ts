import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { fetchPostingScheduleByClient } from '@/lib/queries/db'
import { fetchClientData } from '@/lib/clients/fetch-client-data'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const [clientDataResult, scheduleData] = await Promise.all([
    fetchClientData(supabase, id, agencyId),
    fetchPostingScheduleByClient(supabase, id),
  ])

  if ('error' in clientDataResult) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ clientData: clientDataResult.data, posting_schedule: scheduleData })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, id, agencyId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag('agency-clients', 'max')
  return NextResponse.json({ success: true })
}
