import { after, type NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSessionUser } from '@/lib/auth/session'
import type { ExtractionResult } from '@/lib/brand-kit/extract/report'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

// Not a Chromium function itself — it fetches the isolated /api/extract in an `after()` callback, so
// the request returns instantly while extraction keeps running (up to maxDuration on Pro).
export const runtime = 'nodejs'
export const maxDuration = 300

type StartBody = { onboardingSessionId?: unknown; url?: unknown }

// brand_kit_extractions is not in the generated types yet (new migration); cast until `supabase gen types`.
function adminClient(): SupabaseClient {
  return createAdminSupabaseClient() as unknown as SupabaseClient
}

/**
 * Kick off brand-kit extraction for an onboarding session (§2.3). Inserts a `pending` row, returns
 * immediately, and runs the extractor after the response via `after()` — writing `ready`/`fallback`/
 * `failed` back to the row. The Review step polls `/api/extract/status`. Never blocks onboarding.
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
  await admin
    .from('brand_kit_extractions')
    .upsert(
      { onboarding_session_id: onboardingSessionId, agency_id: agencyId, status: 'pending', tokens: null, report: null, updated_at: new Date().toISOString() },
      { onConflict: 'onboarding_session_id' }
    )

  // Call our own /api/extract on the SAME deployment. Use the incoming request's origin, not a fixed
  // env URL — NEXT_PUBLIC_APP_URL points at production, which does not have preview-branch routes.
  const origin = request.nextUrl.origin
  const secret = process.env.CRON_SECRET
  after(async () => {
    const finish = (fields: Record<string, unknown>) =>
      admin.from('brand_kit_extractions').update({ ...fields, updated_at: new Date().toISOString() }).eq('onboarding_session_id', onboardingSessionId)
    try {
      if (!secret) throw new Error('CRON_SECRET is not set')
      const response = await fetch(new URL('/api/extract', origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ url }),
      })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        const snippet = (await response.text()).slice(0, 120)
        throw new Error(`extract returned ${response.status} (${response.headers.get('content-type') ?? 'no content-type'}): ${snippet}`)
      }
      const result = (await response.json()) as ExtractionResult
      await finish({ status: result.report?.fallback?.toDefaultKit ? 'fallback' : 'ready', tokens: result.tokens, report: result.report })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'extraction failed'
      await finish({ status: 'failed', report: { source: 'website', confidence: {}, fallback: { toDefaultKit: true, reason } } })
    }
  })

  return NextResponse.json({ ok: true })
}
