import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientData } from '@/lib/clients/fetch-client-data'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { performRewrite } from '@/ai/rewrite/rewrite-post'

interface RewriteRequestBody {
  clientId: string
  caption: string
  postType: 'single' | 'carousel' | 'reels'
  slidesJson?: Array<{ headline: string; body: string }>
  aiTells?: string[]
  qualityIssues?: string[]
  platform?: string
  sourceExcerpt?: string | null
  sourceUrl?: string | null
  /** Why the rewrite was triggered — controls which validations run */
  rewriteReason?: 'quality' | 'language' | 'source_grounding' | 'manual'
}

export async function POST(request: Request) {
  try {
    const auth = await resolveAuth()
    if (!auth.ok) return auth.response
    const { supabase, agencyId, userId } = auth

    const rl = checkRateLimit(`ai:rewrite:${userId}`, AI_RATE_LIMIT)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
    }

    let body: RewriteRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!body.clientId || !body.caption) {
      return NextResponse.json({ error: 'clientId and caption are required' }, { status: 400 })
    }

    const clientResult = await fetchClientData(supabase, body.clientId, agencyId)
    if ('error' in clientResult) return NextResponse.json({ error: clientResult.error }, { status: 404 })

    const result = await performRewrite({
      caption: body.caption,
      postType: body.postType,
      slidesJson: body.slidesJson,
      aiTells: body.aiTells ?? [],
      qualityIssues: body.qualityIssues,
      platform: body.platform ?? 'instagram',
      sourceExcerpt: body.sourceExcerpt,
      sourceUrl: body.sourceUrl,
      rewriteReason: body.rewriteReason ?? 'manual',
      client: clientResult.data,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[rewrite] Unhandled error:', error)
    return NextResponse.json({ error: 'Failed to rewrite post. Please try again.' }, { status: 500 })
  }
}
