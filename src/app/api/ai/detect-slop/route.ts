import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { validateQuality } from '@/ai/validation/prompts/prompt-builder'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'
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
    const raw = await validateQuality({ caption: body.text })
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
