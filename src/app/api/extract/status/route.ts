import { type NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSessionUser } from '@/lib/auth/session'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// brand_kit_extractions is not in the generated types yet (new migration); cast until `supabase gen types`.
function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/** Poll target for the Review step (§2.3): the extraction status + tokens/report for a session, scoped
 *  to the caller's agency. Returns `pending` until the `after()` extractor finishes. */
export async function GET(request: NextRequest) {
  const { agencyId } = await requireSessionUser()
  const session = request.nextUrl.searchParams.get('session')
  if (!session) return NextResponse.json({ error: 'session required' }, { status: 400 })

  const admin = adminClient()
  const { data } = await admin
    .from('brand_kit_extractions')
    .select('status, tokens, report, agency_id')
    .eq('onboarding_session_id', session)
    .maybeSingle()

  const row = data as { status: string; tokens: unknown; report: unknown; agency_id: string | null } | null
  if (!row || row.agency_id !== agencyId) {
    return NextResponse.json({ status: 'pending', tokens: null, report: null })
  }
  return NextResponse.json({ status: row.status, tokens: row.tokens, report: row.report })
}
