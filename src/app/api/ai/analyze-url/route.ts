import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchWebsiteSource } from '@/lib/sources/fetch-website'
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
      fetchWebsiteSource(`https://www.instagram.com/${handle}/`).then((r) => ({
        source: 'instagram',
        markdown: r.markdown,
        error: r.error,
      }))
    )
  }

  const results = await Promise.allSettled(fetches)
  let websiteContent = ''
  let instagramContent = ''

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    if (result.value.source === 'website' && result.value.markdown) {
      websiteContent = result.value.markdown
    }
    if (result.value.source === 'instagram' && result.value.markdown) {
      instagramContent = result.value.markdown
    }
  }

  if (!websiteContent && !instagramContent) {
    return NextResponse.json(
      { error: 'Could not fetch content from the provided URLs' },
      { status: 422 }
    )
  }

  try {
    const analysis = await analyzeUrl({ websiteContent, instagramContent })
    return NextResponse.json(analysis)
  } catch {
    return NextResponse.json({ error: 'Failed to parse analysis response' }, { status: 500 })
  }
}
