import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import {
  fetchPostingScheduleByClient,
  fetchClientSourceSummaries,
  fetchConnectionsByClient,
  fetchBrandProfileByClient,
} from '@/lib/queries/db'
import { fetchClientData } from '@/lib/clients/fetch-client-data'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const [clientDataResult, scheduleData, sources, connections, brandProfile] = await Promise.all([
    fetchClientData(supabase, id, agencyId),
    fetchPostingScheduleByClient(supabase, id),
    // Feed the generate flow's run-plan preview and schedule dialog. Kept out of
    // ClientData on purpose: that type round-trips as preloadedClientData in
    // generation POST bodies and must not grow.
    fetchClientSourceSummaries(supabase, id),
    fetchConnectionsByClient(supabase, id),
    fetchBrandProfileByClient(supabase, id),
  ])

  // Ownership: fetchClientData scopes by agencyId and errors for foreign
  // clients, so a 404 here also gates the sibling fetches' results.
  if ('error' in clientDataResult) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    clientData: clientDataResult.data,
    posting_schedule: scheduleData,
    sources,
    connections,
    // The exact key use-best-time.ts already reads — it never existed in this
    // response before, so bestTimeData was always null.
    brand_profile: { best_time_json: brandProfile?.best_time_json ?? null },
  })
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
