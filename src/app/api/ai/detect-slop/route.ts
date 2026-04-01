import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { validateQuality } from '@/ai/validation/prompts/validate-quality'
import { REWRITE_SCORE_THRESHOLD } from '@/lib/content-rules/constants'
import type { SlopDetection } from '@/types/api'

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
    const quality = await validateQuality({ caption: body.text })
    const result: SlopDetection = {
      reads_as_human: quality.human_score >= REWRITE_SCORE_THRESHOLD,
      ai_tells_found: quality.ai_tells,
      worst_offending_phrase: quality.worst_offending_phrase,
      human_authenticity_score: quality.human_score,
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Slop detection failed' }, { status: 500 })
  }
}
