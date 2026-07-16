import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { getBrandKitForClient, getClientFeedSystem } from '@/lib/brand-kit/queries'
import { clampArtDirection } from '@/lib/brand-kit/art-direction'
import { resolveVector } from '@/lib/images/bank'
import { DEFAULT_TOKENS } from '@/lib/scene-graph'
import { createUntypedAdminClient } from '@/lib/supabase/admin'

// Generating an on-demand vector calls Recraft in-request; give it headroom.
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * The client's brand vector library (`brand_vector_bank`) — the on-brand marks generated at onboarding
 * (and later in the editor). Read by the visual editor's Elements picker so an operator can drop a brand
 * vector onto a slide. Session-authed, agency-scoped.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  if (!(await verifyClientOwnership(auth.supabase, id, auth.agencyId))) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const db = createUntypedAdminClient()
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

/**
 * Generate one on-demand brand vector from an operator prompt (the editor's "add an element" tool) — an
 * on-brand mark via Recraft, banked for reuse and returned to insert as a mark layer. Session-authed,
 * agency-scoped. Fail-soft: `{ svg: null }` so the editor just does nothing.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  if (!(await verifyClientOwnership(auth.supabase, id, auth.agencyId))) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  let body: { prompt?: string }
  try {
    body = (await request.json()) as { prompt?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const motif = (body.prompt ?? '').trim()
  if (!motif) return NextResponse.json({ error: 'A prompt is required' }, { status: 400 })

  const [kit, feedSystem] = await Promise.all([getBrandKitForClient(id, auth.agencyId), getClientFeedSystem(id)])
  const colors = (kit?.tokens ?? DEFAULT_TOKENS).color
  const ornament = kit?.art_direction ? clampArtDirection(kit.art_direction).ornamentBrief : ''
  const svg = await resolveVector({ clientId: id, motif, colors, feedSystemSlug: feedSystem.slug, ornament })
  return NextResponse.json({ svg })
}
