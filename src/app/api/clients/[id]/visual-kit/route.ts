import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'

/**
 * A client's visual kit for client-side rendering — the tokens (weight-augmented for the feed system),
 * the feed-system slug, and the client name (the composition kicker). Used by the generation wizard to
 * preview designed slides before the post is saved (its posts live in browser state until approve).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const db = createUntypedAdminClient()
  const { data: clientRow } = await db.from('clients').select('name, agency_id').eq('id', id).maybeSingle()
  const client = clientRow as { name?: string; agency_id?: string } | null
  if (!client || client.agency_id !== auth.agencyId) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const [kit, feedSystem] = await Promise.all([getBrandKitForClient(id, auth.agencyId), getClientFeedSystem(id)])

  return NextResponse.json({
    tokens: feedSystemTokens(feedSystem.slug, kit?.tokens ?? DEFAULT_TOKENS),
    feedSystemSlug: feedSystem.slug,
    clientName: client.name ?? '',
  })
}
