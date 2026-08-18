import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientData } from '@/lib/clients/fetch-client-data'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { performRewrite } from '@/ai/rewrite/rewrite-post'
import { MAX_CAROUSEL_SLIDES } from '@/utils/constants'

/**
 * Every field here is spent on a model call, so each carries a ceiling.
 *
 * `postType` and `rewriteReason` are enums rather than strings because both steer which
 * validations run downstream — `postType` picks the carousel path, `rewriteReason` picks
 * the checks. They were typed as unions and never checked, so an unexpected value chose
 * a branch by falling through it.
 *
 * The caption cap is generous against Instagram's 2200 limit: rewrite is also offered on
 * drafts a judge has already flagged as overlong, and rejecting those at the boundary
 * would block the one action that fixes them.
 */
const MAX_CAPTION_CHARS = 5000
const MAX_SLIDE_FIELD_CHARS = 2000
const MAX_EVIDENCE_ITEMS = 50

const rewriteSchema = z.object({
  clientId: z.uuid(),
  caption: z.string().min(1).max(MAX_CAPTION_CHARS),
  postType: z.enum(['single', 'carousel']),
  slidesJson: z
    .array(
      z.object({
        headline: z.string().max(MAX_SLIDE_FIELD_CHARS),
        body: z.string().max(MAX_SLIDE_FIELD_CHARS),
      })
    )
    .max(MAX_CAROUSEL_SLIDES)
    .optional(),
  aiTells: z.array(z.string().max(1000)).max(MAX_EVIDENCE_ITEMS).optional(),
  qualityIssues: z.array(z.string().max(1000)).max(MAX_EVIDENCE_ITEMS).optional(),
  platform: z.string().max(100).optional(),
  sourceExcerpt: z.string().max(20_000).nullish(),
  sourceUrl: z.string().max(2048).nullish(),
  /** Why the rewrite was triggered — controls which validations run */
  rewriteReason: z.enum(['quality', 'language', 'source_grounding', 'manual']).optional(),
})

/** Rewrite one post's copy against its validation evidence and return the fresh draft. */
export async function POST(request: Request) {
  try {
    const auth = await resolveAuth()
    if (!auth.ok) return auth.response
    const { supabase, agencyId, userId } = auth

    const limited = aiRateLimitResponse('rewrite', userId)
    if (limited) return limited

    const parsed = rewriteSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'clientId and caption are required' }, { status: 400 })
    }
    const body = parsed.data

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
