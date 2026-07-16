import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { getBrandKitForClient } from '@/lib/brand-kit/queries'
import { composeArtDirection } from '@/lib/brand-kit/compose-art-direction'
import { parsePillars } from '@/lib/clients/content-pillars'
import { createUntypedAdminClient } from '@/lib/supabase/admin'

// One Claude call; modest headroom.
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recompose an existing client's art direction from its persisted business context (`brand_profiles`) +
 * visual identity (`brand_kits` brief/tokens) — the settings "Recompose" action. Agency-scoped. Returns
 * `{ artDirection }`; the Visual system tab shows it and persists on Save. Fail-soft composer.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const db = createUntypedAdminClient()
  const { data: clientRow } = await db.from('clients').select('agency_id, niche').eq('id', id).maybeSingle()
  const client = clientRow as { agency_id?: string; niche?: string } | null
  if (!client || client.agency_id !== auth.agencyId) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const [{ data: profileRow }, kit] = await Promise.all([
    db.from('brand_profiles').select('tone, target_audience, content_pillars, language_formality').eq('client_id', id).maybeSingle(),
    getBrandKitForClient(id, auth.agencyId),
  ])
  const p = (profileRow ?? {}) as { tone?: string; target_audience?: string; content_pillars?: string | null; language_formality?: string }
  const tokens = kit?.tokens

  const artDirection = await composeArtDirection({
    mood: kit?.brief?.mood ?? '',
    motifs: kit?.brief?.motifs ?? [],
    photographicSubjects: kit?.brief?.photographicSubjects ?? [],
    palette: tokens ? Object.values(tokens.color) : [],
    fontCategory: tokens?.type.display.family ?? '',
    niche: client.niche ?? '',
    audience: p.target_audience ?? '',
    goal: '',
    tone: p.tone ?? '',
    formalityNote: p.language_formality ?? '',
    pillars: parsePillars(p.content_pillars ?? null).map((wp) => wp.pillar),
    references: '',
  })
  return NextResponse.json({ artDirection })
}
