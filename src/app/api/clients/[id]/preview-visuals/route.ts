import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { generatePreviewVisuals } from '@/lib/renderer/generate-post-visuals'
import { createUntypedAdminClient } from '@/lib/supabase/admin'
import type { CarouselSlide } from '@/types/api'

// Generates fal plates in-request; give it headroom (matches the other imagery routes).
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Generate the imagery for an *unsaved* wizard post's slides — the manual generation flow's visuals.
 * Returns the fully filled compositions (photo plates AND generated vector marks). Cached by slide-copy
 * hash, so when the operator approves and the post is saved, `composePostVisuals` reuses them (no double
 * spend). Operator-initiated (the wizard is a manual flow), so the spend is intended.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const db = createUntypedAdminClient()
  const { data: clientRow } = await db.from('clients').select('agency_id').eq('id', id).maybeSingle()
  const client = clientRow as { agency_id?: string } | null
  if (!client || client.agency_id !== auth.agencyId) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  let body: { slides?: CarouselSlide[] }
  try {
    body = (await request.json()) as { slides?: CarouselSlide[] }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const slides = Array.isArray(body.slides) ? body.slides : []
  if (slides.length === 0) return NextResponse.json({ slides: [] })

  const composed = await generatePreviewVisuals({ clientId: id, agencyId: auth.agencyId, slides })
  return NextResponse.json({ slides: composed })
}
