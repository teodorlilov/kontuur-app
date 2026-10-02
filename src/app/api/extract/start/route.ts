import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { runAsSpender } from '@/lib/billing/spend-context'
import { createAdminSupabaseClient, type AdminClient } from '@/lib/supabase/admin'
import { extractIdentity } from '@/lib/visual/extract-identity'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { writeExtraction } from '@/lib/visual/queries'

/**
 * Room for the `after()` work: one capture (`captureSite`, src/lib/visual/capture/capture-site.ts,
 * whose timeouts and limiter set its length) and one Haiku call.
 */
export const maxDuration = 300

/**
 * `websiteUrl` stays a plain bounded string, not `z.url()`: an empty or absent value is
 * the documented "no website" path below, which stores the default-palette identity, and
 * a malformed one is the capture's problem to report — this route answers before the
 * capture runs, so a shape rejection here would be the only signal the user ever saw.
 */
const startExtractionSchema = z.object({
  onboardingSessionId: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().max(2048).optional(),
})

/**
 * One extraction row write, logged under `[extract:start]` with its session when it fails.
 * `writeExtraction` answers a failed upsert as `{ error }` rather than throwing, so this check is
 * the only place such a failure surfaces; the caller decides what it answers.
 */
async function recordExtraction(
  admin: AdminClient,
  sessionId: string,
  patch: Parameters<typeof writeExtraction>[2]
): Promise<boolean> {
  const { error } = await writeExtraction(admin, sessionId, patch)
  if (error)
    console.error(`[extract:start] session ${sessionId}: ${patch.status} write failed:`, error)
  return !error
}

/**
 * Kick off async brand-visual-identity extraction for an onboarding session and answer at once, so
 * the interview never waits. With no website the default-palette identity is stored as `fallback`
 * straight away; otherwise a `pending` row is written and the capture runs in `after()`, landing
 * as `ready` or `fallback`.
 * A write that fails before the response answers 503, so the client keeps its default palette
 * rather than polling a row that will never resolve (`startExtraction`,
 * src/features/onboarding/components/client-setup-flow.tsx). A capture drives a browser and a model
 * call, so it shares the site read's rate limit (`aiRateLimitResponse('analyze-url')`). `after`
 * runs outside the request's async context, so the spender is declared inside it.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId, userId } = auth
  const limited = aiRateLimitResponse('analyze-url', userId)
  if (limited) return limited
  const refused = await requireEntitledRoute(agencyId, 'spend')
  if (refused) return refused

  const parsed = startExtractionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'onboardingSessionId is required' }, { status: 400 })
  }
  const sessionId = parsed.data.onboardingSessionId
  const websiteUrl = parsed.data.websiteUrl
  const admin = createAdminSupabaseClient()

  if (!websiteUrl) {
    const stored = await recordExtraction(admin, sessionId, {
      status: 'fallback',
      agencyId,
      identity: buildDefaultIdentity(),
      report: { source: 'fallback', fallback: { reason: 'no website provided' } },
    })
    if (!stored) return NextResponse.json({ error: 'extraction unavailable' }, { status: 503 })
    return NextResponse.json({ status: 'fallback' }, { status: 202 })
  }

  const pending = await recordExtraction(admin, sessionId, { status: 'pending', agencyId })
  if (!pending) return NextResponse.json({ error: 'extraction unavailable' }, { status: 503 })

  after(async () => {
    try {
      const result = await runAsSpender({ agencyId, flow: 'onboarding' }, () =>
        extractIdentity({ url: websiteUrl })
      )
      await recordExtraction(admin, sessionId, {
        status: result.report.source === 'website' ? 'ready' : 'fallback',
        agencyId,
        identity: result.identity,
        report: result.report,
      })
    } catch (err) {
      console.error(`[extract:start] session ${sessionId}: extraction failed:`, err)
      await recordExtraction(admin, sessionId, {
        status: 'fallback',
        agencyId,
        identity: buildDefaultIdentity(),
        report: { source: 'fallback', fallback: { reason: 'extraction error' } },
      })
    }
  })

  return NextResponse.json({ status: 'pending' }, { status: 202 })
}
