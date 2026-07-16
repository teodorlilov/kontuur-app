import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientWithOwnership } from '@/lib/auth/helpers'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { feedSystemTokens } from '@/lib/renderer/feed-system-compositions'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'

/**
 * A client's visual kit for client-side rendering — the tokens (weight-augmented for the feed system),
 * the feed-system slug, and the client name (the composition kicker). Used by the generation wizard to
 * preview designed slides before the post is saved (its posts live in browser state until approve).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const client = await fetchClientWithOwnership(auth.supabase, id, auth.agencyId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const [kit, feedSystem] = await Promise.all([getBrandKitForClient(id, auth.agencyId), getClientFeedSystem(id)])

  return NextResponse.json({
    tokens: feedSystemTokens(feedSystem.slug, kit?.tokens ?? DEFAULT_TOKENS),
    feedSystemSlug: feedSystem.slug,
    clientName: client.name,
  })
}
