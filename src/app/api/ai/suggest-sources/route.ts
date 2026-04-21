import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { suggestSources } from '@/ai/suggest-sources/suggest-sources'
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

  try {
    const results = await suggestSources({ niche: body.niche, clientName: body.clientName })
    const suggestions: SourceSuggestion[] = results.map((s) => ({
      url: s.url,
      label: s.label,
      reason: s.reason,
      valid: true,
    }))
    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[suggest-sources] failed:', err)
    return NextResponse.json({ suggestions: [] })
  }
}
