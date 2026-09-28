import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchClientData } from '@/lib/clients/fetch-client-data'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import { reserveUsage, runMetered, spendFailureResponse } from '@/lib/billing/usage'
import { performRewrite } from '@/ai/rewrite/rewrite-post'
import { MAX_CAROUSEL_SLIDES } from '@/utils/constants'

/**
 * The caption cap is generous against Instagram's 2200 limit (`CAPTION_MAX_CHARS`,
 * src/lib/meta/networks/instagram-caption.ts): rewrite is also offered on drafts a judge has
 * already flagged as overlong, and rejecting those at the boundary would block the one action
 * that fixes them.
 */
const MAX_CAPTION_CHARS = 5000
const MAX_SLIDE_FIELD_CHARS = 2000
const MAX_EVIDENCE_ITEMS = 50

/**
 * Every field here is spent on a model call, so each carries a ceiling. `postType` and
 * `rewriteReason` are enums rather than strings because both steer which validations run
 * downstream: `postType` picks the carousel path, `rewriteReason` picks the checks, and an
 * unchecked value would choose a branch by falling through it. A slide keeps its other fields
 * (`slide_number`, `slide_role`), since the rewritten text is merged back onto it and saved whole.
 */
const rewriteSchema = z.object({
  clientId: z.uuid(),
  caption: z.string().min(1).max(MAX_CAPTION_CHARS),
  postType: z.enum(['single', 'carousel']),
  slidesJson: z
    .array(
      z.looseObject({
        headline: z.string().max(MAX_SLIDE_FIELD_CHARS),
        body: z.string().max(MAX_SLIDE_FIELD_CHARS),
      })
    )
    .max(MAX_CAROUSEL_SLIDES)
    .optional(),
  aiTells: z.array(z.string().max(1000)).max(MAX_EVIDENCE_ITEMS).optional(),
  qualityIssues: z.array(z.string().max(1000)).max(MAX_EVIDENCE_ITEMS).optional(),
  sourceExcerpt: z.string().max(20_000).nullish(),
  sourceUrl: z.string().max(2048).nullish(),
  /** Why the rewrite was triggered — controls which validations run */
  rewriteReason: z.enum(['quality', 'language', 'source_grounding', 'manual']).optional(),
})

/** What the person reads when a rewrite fails without a reason of its own. */
const REWRITE_FAILED = 'Failed to rewrite post. Please try again.'

/**
 * Rewrite one post's copy against its validation evidence and return the fresh draft. One rewrite
 * is reserved from the allowance before the model runs and counted only once the model has
 * answered — `runMetered` gives it back if the call throws, so only a rewrite that exists is on
 * the meter. The route's work is a model call, so a failed spend answers 502 in the error's own
 * words, or 402 when the allowance refused it (`spendFailureResponse`); a throw before the spend
 * is ours, a 500.
 */
export async function POST(request: Request) {
  try {
    const auth = await resolveAuth()
    if (!auth.ok) return auth.response
    const { supabase, agencyId, userId } = auth

    const limited = aiRateLimitResponse('rewrite', userId)
    if (limited) return limited
    const refused = await requireEntitledRoute(agencyId, 'spend')
    if (refused) return refused

    const parsed = rewriteSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'clientId and caption are required' }, { status: 400 })
    }
    const body = parsed.data

    const clientResult = await fetchClientData(supabase, body.clientId, agencyId)
    if ('error' in clientResult)
      return NextResponse.json({ error: clientResult.error }, { status: 404 })

    const spender = { agencyId, clientId: body.clientId, flow: 'rewrite' as const }
    try {
      const result = await runMetered(spender, async () => {
        await reserveUsage(spender, 'rewrite', 1)
        return performRewrite({
          caption: body.caption,
          postType: body.postType,
          slidesJson: body.slidesJson,
          aiTells: body.aiTells ?? [],
          qualityIssues: body.qualityIssues,
          sourceExcerpt: body.sourceExcerpt,
          sourceUrl: body.sourceUrl,
          rewriteReason: body.rewriteReason ?? 'manual',
          client: clientResult.data,
        })
      })
      return NextResponse.json(result)
    } catch (err) {
      return spendFailureResponse(err, 'rewrite', REWRITE_FAILED)
    }
  } catch (error) {
    console.error('[rewrite] Unhandled error:', error)
    return NextResponse.json({ error: REWRITE_FAILED }, { status: 500 })
  }
}
