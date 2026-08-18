import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientData } from '@/lib/clients/fetch-client-data'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { performRewrite } from '@/ai/rewrite/rewrite-post'
import type { PostType } from '@/types/api'
import type { SlideText } from '@/types/slide'

interface RewriteRequestBody {
  clientId: string
  caption: string
  postType: PostType
  slidesJson?: SlideText[]
  aiTells?: string[]
  qualityIssues?: string[]
  platform?: string
  sourceExcerpt?: string | null
  sourceUrl?: string | null
  /** Why the rewrite was triggered — controls which validations run */
  rewriteReason?: 'quality' | 'language' | 'source_grounding' | 'manual'
}

/** Rewrite one post's copy against its validation evidence and return the fresh draft. */
export async function POST(request: Request) {
  try {
    const auth = await resolveAuth()
    if (!auth.ok) return auth.response
    const { supabase, agencyId, userId } = auth

    const limited = aiRateLimitResponse('rewrite', userId)
    if (limited) return limited

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
    if ('error' in clientResult)
      return NextResponse.json({ error: clientResult.error }, { status: 404 })

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
    return NextResponse.json(
      { error: 'Failed to rewrite post. Please try again.' },
      { status: 500 }
    )
  }
}
