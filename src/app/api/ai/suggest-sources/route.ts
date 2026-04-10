import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { suggestSources } from '@/ai/suggest-sources/suggest-sources'
import { isValidRssUrl } from '@/lib/sources/fetch-rss'
import type { SourceSuggestion } from '@/types/api'

interface SuggestSourcesBody {
  niche: string
  clientName?: string
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: SuggestSourcesBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.niche?.trim()) {
    return NextResponse.json({ error: 'niche is required' }, { status: 400 })
  }

  let claudeSuggestions
  try {
    claudeSuggestions = await suggestSources({ niche: body.niche, clientName: body.clientName })
  } catch (err) {
    console.error('[suggest-sources] AI call failed:', err)
    return NextResponse.json({ suggestions: [] })
  }

  // Validate all suggested URLs in parallel
  const validated = await Promise.allSettled(
    claudeSuggestions.map(async (s) => {
      const valid = await isValidRssUrl(s.url)
      return { ...s, valid, error: valid ? undefined : 'URL did not return a valid RSS feed' }
    })
  )

  const suggestions: SourceSuggestion[] = validated.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    const fallback = claudeSuggestions[i]
    return {
      url: fallback?.url ?? '',
      label: fallback?.label ?? '',
      reason: fallback?.reason ?? '',
      valid: false,
      error: 'Validation failed',
    }
  })

  return NextResponse.json({ suggestions })
}
