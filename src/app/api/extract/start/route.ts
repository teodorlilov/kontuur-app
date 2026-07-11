import { after, type NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSessionUser } from '@/lib/auth/session'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

// Carries Chromium (like /api/extract) because it runs the extractor in-process — see the after() note.
export const runtime = 'nodejs'
export const maxDuration = 300

type StartBody = { onboardingSessionId?: unknown; url?: unknown }

// brand_kit_extractions is not in the generated types yet (new migration); cast until `supabase gen types`.
function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * Kick off brand-kit extraction for an onboarding session (§2.3). Inserts a `pending` row, returns
 * immediately, and runs the extractor **in-process** via `after()` — no self-HTTP, so it is not blocked
 * by Vercel Deployment Protection or the auth middleware. Writes `ready`/`fallback`/`failed` back to the
 * row; the Review polls `/api/extract/status`. Never blocks onboarding.
 */
export async function POST(request: NextRequest) {
  const { agencyId } = await requireSessionUser()

  let body: StartBody
  try {
    body = (await request.json()) as StartBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof body.onboardingSessionId !== 'string' || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'onboardingSessionId and url required' }, { status: 400 })
  }
  const onboardingSessionId = body.onboardingSessionId
  const url = body.url

  const admin = adminClient()
  const { error: upsertError } = await admin
    .from('brand_kit_extractions')
    .upsert(
      { onboarding_session_id: onboardingSessionId, agency_id: agencyId, status: 'pending', tokens: null, report: null, updated_at: new Date().toISOString() },
      { onConflict: 'onboarding_session_id' }
    )
  if (upsertError) {
    return NextResponse.json({ error: `could not create extraction row: ${upsertError.message}` }, { status: 500 })
  }

  after(async () => {
    const finish = (fields: Record<string, unknown>) =>
      admin.from('brand_kit_extractions').update({ ...fields, updated_at: new Date().toISOString() }).eq('onboarding_session_id', onboardingSessionId)
    try {
      // Import Chromium lazily so a launch/binary failure surfaces as a `failed` reason on the row,
      // not a silent 500 at module load that would leave the row unwritten.
      const { extractBrandKitFromWebsite } = await import('@/lib/brand-kit/extract/extract-website')
      const result = await extractBrandKitFromWebsite(url)
      await finish({ status: result.report?.fallback?.toDefaultKit ? 'fallback' : 'ready', tokens: result.tokens, report: result.report })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'extraction failed'
      await finish({ status: 'failed', report: { source: 'website', confidence: {}, fallback: { toDefaultKit: true, reason } } })
    }
  })

  return NextResponse.json({ ok: true })
}
