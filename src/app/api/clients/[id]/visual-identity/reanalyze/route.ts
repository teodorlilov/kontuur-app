import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { extractIdentity } from '@/lib/visual/extract-identity'
import { upsertVisualIdentity } from '@/lib/visual/queries'

// Synchronous hardened capture + vision; allow headroom.
export const maxDuration = 60

/** Re-run brand-visual extraction from the client's website and persist the fresh identity. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const { data: client } = await supabase
    .from('clients')
    .select('id, website_url')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!client.website_url) {
    return NextResponse.json({ error: 'No website on file for this client' }, { status: 400 })
  }

  const result = await extractIdentity({ url: client.website_url })

  const source = result.report.source === 'website' ? 'website' : 'default'
  const { error } = await upsertVisualIdentity(id, result.identity, source, result.report)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ identity: result.identity, report: result.report })
}
