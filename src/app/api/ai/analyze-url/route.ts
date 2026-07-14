import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchWebsiteSource } from '@/lib/sources/fetch-website'
import { fetchInstagramProfile } from '@/lib/sources/fetch-instagram'
import { analyzeUrl } from '@/utils/ai'

interface AnalyzeUrlBody {
  websiteUrl?: string
  instagramHandle?: string
}

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: AnalyzeUrlBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.websiteUrl?.trim() && !body.instagramHandle?.trim()) {
    return NextResponse.json(
      { error: 'At least one of websiteUrl or instagramHandle is required' },
      { status: 400 }
    )
  }

  // Fetch content in parallel
  const fetches: Promise<{ source: string; markdown: string; error?: string }>[] = []

  if (body.websiteUrl?.trim()) {
    fetches.push(
      fetchWebsiteSource(body.websiteUrl.trim()).then((r) => ({
        source: 'website',
        markdown: r.markdown,
        error: r.error,
      }))
    )
  }

  if (body.instagramHandle?.trim()) {
    const handle = body.instagramHandle.trim().replace(/^@/, '')
    fetches.push(
      fetchInstagramProfile(handle).then((r) => ({
        source: 'instagram',
        markdown: r.markdown,
        error: r.error,
      }))
    )
  }

  const results = await Promise.allSettled(fetches)
  let websiteContent = ''
  let instagramContent = ''
  const details: string[] = []

  for (const result of results) {
    if (result.status !== 'fulfilled') {
      details.push('fetch rejected')
      continue
    }
    const { source, markdown, error } = result.value
    if (source === 'website') {
      if (markdown) websiteContent = markdown
      else if (error) details.push(`website: ${error}`)
    }
    if (source === 'instagram') {
      if (markdown) instagramContent = markdown
      else if (error) details.push(`instagram: ${error}`)
    }
  }

  if (!websiteContent && !instagramContent) {
    // Surface the real reason (HTTP 403, JS-only site, parse error, …) instead of a blank 422.
    return NextResponse.json(
      { error: 'Could not fetch content from the provided URLs', details },
      { status: 422 }
    )
  }

  try {
    const analysis = await analyzeUrl({ websiteContent, instagramContent })
    return NextResponse.json(analysis)
  } catch (err) {
    // Surface the real cause (was masked as "Failed to parse") — an Anthropic API error (e.g. a missing
    // key) throws here and looks identical to a genuine JSON-parse failure. Logged for Vercel too.
    console.error('[analyze-url] analyzeUrl failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to analyze the provided URLs'
    return NextResponse.json({ error: `URL analysis failed: ${message}` }, { status: 500 })
  }
}
