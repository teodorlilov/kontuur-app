import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { resolveClientWebsite } from '@/lib/clients/resolve-client-website'
import { extractIdentity } from '@/lib/visual/extract-identity'
import { fetchVisualIdentity, upsertVisualIdentity } from '@/lib/visual/queries'

// Synchronous hardened capture; allow headroom.
export const maxDuration = 60

/** Re-run brand-visual extraction from the client's website and persist the fresh identity. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId } = auth

  const site = await resolveClientWebsite(supabase, id, agencyId)
  if (!site.ok) return site.response

  // Re-analysis refreshes measured colours but must not reset the user's chosen brand style.
  const stored = await fetchVisualIdentity(id)
  const result = await extractIdentity({
    url: site.websiteUrl,
    ...(stored?.style ? { currentStyle: stored.style } : {}),
  })

  const source = result.report.source === 'website' ? 'website' : 'default'
  const { error } = await upsertVisualIdentity(id, result.identity, source, result.report)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ identity: result.identity, report: result.report })
}
