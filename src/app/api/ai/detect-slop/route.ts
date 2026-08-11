import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { validateQuality } from '@/ai/validation/prompts/prompt-builder'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'
import type { SlopDetection } from '@/types/api'

/** Score one draft for AI-sounding copy — the queue's authenticity read, derived from the quality validator. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  let body: { text: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  try {
    const raw = await validateQuality({ caption: body.text })
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
  } catch {
    return NextResponse.json({ error: 'Slop detection failed' }, { status: 500 })
  }
}
