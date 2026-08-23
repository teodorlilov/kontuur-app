import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchExtraction } from '@/lib/visual/queries'

/**
 * Poll an onboarding extraction session. Returns `pending` until the async capture lands, then the
 * measured (or fallback) identity + confidence report for the Review step to surface.
 *
 * Scoped to the caller's agency, not just to a signed-in user. The row is read through the
 * service-role client, so being authenticated was the whole check: any signed-in user
 * holding a session id could read another agency's extracted palette, logo and confidence
 * report. `/api/extract/start` stamps `agency_id` on the row, so the scope was always there
 * to filter on.
 */
export async function GET(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const sessionId = new URL(request.url).searchParams.get('session')?.trim()
  if (!sessionId) {
    return NextResponse.json({ error: 'session is required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const extraction = await fetchExtraction(admin, sessionId, auth.agencyId)
  if (!extraction) {
    return NextResponse.json({ status: 'pending', identity: null, report: null })
  }
  return NextResponse.json(extraction)
}
