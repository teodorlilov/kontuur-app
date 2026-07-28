import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { suggestSourcesCached } from '@/ai/suggest-sources/suggest-sources'
import type { SourceSuggestion } from '@/types/api'

interface SuggestSourcesBody {
  niche: string
  clientName?: string
  pillars?: string[]
  targetAudience?: string
  language?: string
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { agencyId, userId } = auth

  const rl = checkRateLimit(`ai:suggest-sources:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

  let body: SuggestSourcesBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.niche?.trim()) {
    return NextResponse.json({ error: 'niche is required' }, { status: 400 })
  }

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
