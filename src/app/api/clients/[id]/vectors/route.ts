import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createUntypedAdminClient } from '@/lib/supabase/admin'

/**
 * The client's brand vector library (`brand_vector_bank`) — the on-brand marks generated at onboarding
 * (and later in the editor). Read by the visual editor's Elements picker so an operator can drop a brand
 * vector onto a slide. Session-authed, agency-scoped.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const db = createUntypedAdminClient()
  const { data: clientRow } = await db.from('clients').select('agency_id').eq('id', id).maybeSingle()
  const client = clientRow as { agency_id?: string } | null
  if (!client || client.agency_id !== auth.agencyId) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const { data } = await db
    .from('brand_vector_bank')
    .select('svg, label')
    .eq('client_id', id)
    .order('created_at', { ascending: true })

  const vectors = ((data as Array<{ svg: string; label: string | null }> | null) ?? []).map((v) => ({
    svg: v.svg,
    label: v.label ?? '',
  }))
  return NextResponse.json({ vectors })
}
