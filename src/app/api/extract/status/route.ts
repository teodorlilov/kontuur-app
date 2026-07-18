import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchExtraction } from '@/lib/visual/queries'

/**
 * Poll an onboarding extraction session. Returns `pending` until the async capture lands, then the
 * measured (or fallback) identity + confidence report for the Review step to surface.
 */
export async function GET(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const sessionId = new URL(request.url).searchParams.get('session')?.trim()
  if (!sessionId) {
    return NextResponse.json({ error: 'session is required' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const extraction = await fetchExtraction(admin, sessionId)
  if (!extraction) {
    return NextResponse.json({ status: 'pending', identity: null, report: null })
  }
  return NextResponse.json(extraction)
}
