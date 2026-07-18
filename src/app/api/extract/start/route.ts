import { NextResponse, after } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { extractIdentity } from '@/lib/visual/extract-identity'
import { buildDefaultIdentity } from '@/lib/visual/identity'
import { writeExtraction } from '@/lib/visual/queries'
import { toVibePresetId } from '@/lib/visual/vibe-presets'

// Hardened Chromium capture + a vision call runs after the response (Next `after`); allow headroom.
export const maxDuration = 60

interface StartBody {
  onboardingSessionId?: string
  websiteUrl?: string
  fallbackPresetId?: string
}

/**
 * Kick off async brand-visual-identity extraction for an onboarding session. Writes a `pending` row,
 * schedules the capture via `after()`, and returns immediately so the interview never waits.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId } = auth

  let body: StartBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const sessionId = body.onboardingSessionId?.trim()
  if (!sessionId) {
    return NextResponse.json({ error: 'onboardingSessionId is required' }, { status: 400 })
  }
  const websiteUrl = body.websiteUrl?.trim()
  const fallbackPresetId = toVibePresetId(body.fallbackPresetId)
  const admin = createAdminSupabaseClient()

  // No website → nothing to capture; store the preset-default identity immediately.
  if (!websiteUrl) {
    await writeExtraction(admin, sessionId, {
      status: 'fallback',
      agencyId,
      identity: buildDefaultIdentity(fallbackPresetId),
      report: { source: 'fallback', confidence: { preset: 'inferred' }, fallback: { reason: 'no website provided' } },
    })
    return NextResponse.json({ status: 'fallback' }, { status: 202 })
  }

  await writeExtraction(admin, sessionId, { status: 'pending', agencyId })

  after(async () => {
    try {
      const result = await extractIdentity({ url: websiteUrl, fallbackPresetId })
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
        identity: buildDefaultIdentity(fallbackPresetId),
        report: { source: 'fallback', confidence: { preset: 'inferred' }, fallback: { reason: 'extraction error' } },
      }).catch(() => undefined)
    }
  })

  return NextResponse.json({ status: 'pending' }, { status: 202 })
}
