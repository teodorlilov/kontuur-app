import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { extractIdentity } from '@/lib/visual/extract-identity'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { writeExtraction } from '@/lib/visual/queries'

// Hardened Chromium capture + a vision call runs after the response (Next `after`); allow headroom.
export const maxDuration = 60

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
 * Kick off async brand-visual-identity extraction for an onboarding session. Writes a `pending` row,
 * schedules the capture via `after()`, and returns immediately so the interview never waits.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId } = auth

  const parsed = startExtractionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'onboardingSessionId is required' }, { status: 400 })
  }
  const sessionId = parsed.data.onboardingSessionId
  const websiteUrl = parsed.data.websiteUrl
  const admin = createAdminSupabaseClient()

  // No website → nothing to capture; store the default-palette identity immediately.
  if (!websiteUrl) {
    await writeExtraction(admin, sessionId, {
      status: 'fallback',
      agencyId,
      identity: buildDefaultIdentity(),
      report: { source: 'fallback', fallback: { reason: 'no website provided' } },
    })
    return NextResponse.json({ status: 'fallback' }, { status: 202 })
  }

  const pending = await writeExtraction(admin, sessionId, { status: 'pending', agencyId })
  if (pending.error) {
    // Most likely the migration hasn't been run — fail fast so the client falls back immediately
    // instead of polling a status that will never resolve.
    console.error('[extract:start] could not write pending status:', pending.error)
    return NextResponse.json({ error: 'extraction unavailable' }, { status: 503 })
  }

  after(async () => {
    try {
      const result = await extractIdentity({ url: websiteUrl })
      await writeExtraction(admin, sessionId, {
        status: result.report.source === 'website' ? 'ready' : 'fallback',
        agencyId,
        identity: result.identity,
        report: result.report,
      })
    } catch (err) {
      console.error('[extract:start] extraction failed:', err)
      await writeExtraction(admin, sessionId, {
        status: 'fallback',
        agencyId,
        identity: buildDefaultIdentity(),
        report: { source: 'fallback', fallback: { reason: 'extraction error' } },
      }).catch(() => undefined)
    }
  })

  return NextResponse.json({ status: 'pending' }, { status: 202 })
}
