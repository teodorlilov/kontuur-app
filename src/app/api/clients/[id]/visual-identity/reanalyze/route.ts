import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { runAsSpender } from '@/lib/billing/spend-context'
import { resolveClientWebsite } from '@/lib/clients/resolve-client-website'
import { extractIdentity } from '@/lib/visual/extract-identity'
import { fetchVisualIdentity, upsertVisualIdentity } from '@/lib/visual/queries'

/**
 * Room for one capture (`captureSite`, src/lib/visual/capture/capture-site.ts, whose timeouts and
 * limiter set its length) and one Haiku call. The person waits on it, so a kill would answer
 * nothing.
 */
export const maxDuration = 300

/**
 * Re-run brand-visual extraction from the client's website and persist the fresh identity. Each
 * press is a Chromium capture measuring the page's computed styles (`captureSite`) and, when it
 * lands, one text-only Haiku call naming the measured palette (`describePalette`,
 * src/lib/visual/describe-palette.ts); no model sees the page. It shares the site read's rate limit
 * (`aiRateLimitResponse('analyze-url')`). Only the measured colours refresh: the user's chosen brand
 * style is passed through as `currentStyle`.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth
  const limited = aiRateLimitResponse('analyze-url', userId)
  if (limited) return limited
  const refused = await requireEntitledRoute(agencyId, 'spend')
  if (refused) return refused

  const site = await resolveClientWebsite(supabase, id, agencyId)
  if (!site.ok) return site.response

  const stored = await fetchVisualIdentity(id)
  const result = await runAsSpender({ agencyId, clientId: id, flow: 'onboarding' }, () =>
    extractIdentity({
      url: site.websiteUrl,
      ...(stored?.style ? { currentStyle: stored.style } : {}),
    })
  )

  const source = result.report.source === 'website' ? 'website' : 'default'
  const { error } = await upsertVisualIdentity(id, result.identity, source, result.report)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ identity: result.identity, report: result.report })
}
