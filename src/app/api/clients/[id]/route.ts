import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import {
  fetchPostingScheduleByClient,
  fetchClientSourceSummaries,
  fetchConnectionsByClient,
} from '@/lib/queries/db'
import { fetchClientData } from '@/lib/clients/fetch-client-data'

/** Fetch one client with the full generation context the wizard needs. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const [clientDataResult, scheduleData, sources, connections] = await Promise.all([
    fetchClientData(supabase, id, agencyId),
    fetchPostingScheduleByClient(supabase, id),
    // Feed the generate flow's run-plan preview and schedule dialog. Kept out of
    // ClientData on purpose: that type round-trips as preloadedClientData in
    // generation POST bodies and must not grow.
    fetchClientSourceSummaries(supabase, id),
    fetchConnectionsByClient(supabase, id),
  ])

  // Ownership: fetchClientData scopes by agencyId and errors for foreign
  // clients, so a 404 here also gates the sibling fetches' results.
  if ('error' in clientDataResult) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    clientData: clientDataResult.data,
    posting_schedule: scheduleData,
    sources,
    connections,
  })
}
