import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { requireEntitledRoute } from '@/lib/billing/require-entitled'
import { runAsSpender } from '@/lib/billing/spend-context'
import { validateQuality } from '@/ai/validation/prompts/prompt-builder'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'
import type { SlopDetection } from '@/types/api'

/**
 * Caps the text one scoring request may carry.
 *
 * Generous against real use — a caption plus every slide of a carousel — while stopping
 * an arbitrarily large body from being forwarded to the model at our expense.
 */
const detectSlopSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
})

/**
 * Score one draft for AI-sounding copy — the queue's authenticity read, derived from the quality
 * validator. Every request is a paid model call, so it stays rate-limited. A judge that answers
 * without a score is a 502, never a null-filled body a caller would read as a measurement.
 */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  const limited = aiRateLimitResponse('detect-slop', auth.userId)
  if (limited) return limited
  const refused = await requireEntitledRoute(auth.agencyId, 'spend')
  if (refused) return refused

  const parsed = detectSlopSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  try {
    const raw = await runAsSpender({ agencyId: auth.agencyId, flow: 'rewrite' }, () =>
      validateQuality({ caption: parsed.data.text })
    )
    if (raw.human_score === null) {
      return NextResponse.json({ error: 'Slop detection returned no score' }, { status: 502 })
    }
    const result: SlopDetection = deriveSlopFromQuality({
      human_score: raw.human_score,
      ai_tells: raw.ai_tells,
      worst_offending_phrase: raw.worst_offending_phrase,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[detect-slop] scoring failed:', err)
    return NextResponse.json({ error: 'Slop detection failed' }, { status: 500 })
  }
}
