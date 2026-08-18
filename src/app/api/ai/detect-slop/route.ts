import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { validateQuality } from '@/ai/validation/prompts/prompt-builder'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'
import type { SlopDetection } from '@/types/api'

/**
 * Caps the text one scoring request may carry.
 *
 * Generous against real use — a caption plus every slide of a carousel — while stopping
 * an arbitrarily large body from being forwarded to the model at our expense. The route
 * previously read `body.text` with a `?.trim()` check and no ceiling of any kind.
 */
const detectSlopSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
})

/** Score one draft for AI-sounding copy — the queue's authenticity read, derived from the quality validator. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  // A live model call, so it consumes the same per-minute budget as every other one.
  // It had none: the route was authenticated but otherwise unmetered, which made it the
  // cheapest way to spend the account's tokens in a loop.
  const limited = aiRateLimitResponse('detect-slop', auth.userId)
  if (limited) return limited

  const parsed = detectSlopSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  try {
    const raw = await validateQuality({ caption: parsed.data.text })
    if (raw.human_score === null) {
      // The judge answered without judging. Returning a null-filled body would look
      // like a measurement to a caller whose whole purpose is to obtain one.
      return NextResponse.json({ error: 'Slop detection returned no score' }, { status: 502 })
    }
    const result: SlopDetection = deriveSlopFromQuality({
      human_score: raw.human_score,
      ai_tells: raw.ai_tells,
      worst_offending_phrase: raw.worst_offending_phrase,
    })
    return NextResponse.json(result)
  } catch (err) {
    // Logged, not swallowed: this is the boundary, and the previous bare `catch {}`
    // turned every provider outage, timeout and parse failure into one opaque 500.
    console.error('[detect-slop] scoring failed:', err)
    return NextResponse.json({ error: 'Slop detection failed' }, { status: 500 })
  }
}
