import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { suggestSourcesCached } from '@/ai/suggest-sources/suggest-sources'
import type { SourceSuggestion } from '@/types/api'

/**
 * Fields are capped because they are interpolated into a cached model prompt: the cache
 * key is the niche, so an oversized value would be paid for once and then served from
 * cache to every client that shares it.
 */
const suggestSourcesSchema = z.object({
  niche: z.string().trim().min(1).max(200),
  clientName: z.string().trim().max(200).optional(),
  // Capped at 10 here rather than sliced after parsing, which is what the route did.
  pillars: z.array(z.string().min(1).max(200)).max(10).optional(),
  targetAudience: z.string().trim().max(1000).optional(),
  language: z.string().trim().max(100).optional(),
})

/** Suggest research sources for a niche. Cached, because the same niche recurs across clients. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId, userId } = auth

  const limited = aiRateLimitResponse('suggest-sources', userId)
  if (limited) return limited

  const parsed = suggestSourcesSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'niche is required' }, { status: 400 })
  }
  const body = parsed.data

  const pillars = Array.isArray(body.pillars)
    ? body.pillars.filter((p): p is string => typeof p === 'string' && p.length > 0).slice(0, 10)
    : undefined

  try {
    const results = await suggestSourcesCached(agencyId, {
      niche: body.niche,
      clientName: body.clientName,
      pillars,
      targetAudience: body.targetAudience,
      language: body.language,
    })
    const suggestions: SourceSuggestion[] = results.map((s) => ({
      url: s.url,
      label: s.label,
      reason: s.reason,
    }))
    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[suggest-sources] failed:', err)
    return NextResponse.json({ suggestions: [] })
  }
}
