import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { analyzeBrand } from '@/lib/sources/analyze-brand'
import { resolveClientWebsite } from '@/lib/clients/resolve-client-website'

// A sitemap lookup, up to seven page fetches and a model call — the same work the onboarding
// read does, and for the same reason it does not fit the default.
export const maxDuration = 60

/**
 * Re-reads the client's website and returns what it suggests for the brand profile.
 *
 * Deliberately writes nothing. Tone, audience and pillars are hand-edited after onboarding, and
 * pillars in particular are referenced by every source's `pillar_ids` — a route that saved its own
 * read would silently discard both. The caller reviews the suggestions field by field and saves
 * through the normal form, so the change is visible, partial, and discardable.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  // Same pool as the onboarding read: the same paid model call, and the same reason to meter it —
  // this fetches a stored URL, so unthrottled it is also a way to aim our egress at a third party.
  const limited = aiRateLimitResponse('analyze-url', userId)
  if (limited) return limited

  const site = await resolveClientWebsite(supabase, id, agencyId)
  if (!site.ok) return site.response

  try {
    const analysis = await analyzeBrand({ websiteUrl: site.websiteUrl })
    if (!analysis) {
      return NextResponse.json({ error: 'Could not read that website' }, { status: 422 })
    }
    return NextResponse.json(analysis)
  } catch (err) {
    console.error('[brand-profile/reanalyze] analysis failed:', err)
    return NextResponse.json({ error: 'Failed to parse analysis response' }, { status: 500 })
  }
}
