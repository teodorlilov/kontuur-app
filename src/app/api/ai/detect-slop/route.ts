import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { validateQuality } from '@/ai/validation/prompts/prompt-builder'
import { safeParseHookVerdict } from '@/ai/validation/content-rules/compute-scores'
import { REWRITE_SCORE_THRESHOLD } from '@/lib/content-rules/constants'
import { computeQualityScores } from '@/ai/validation/content-rules/compute-scores'
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
    const hook_verdict = safeParseHookVerdict(raw.hook_verdict)
    const scores = computeQualityScores({
      ai_tells: raw.ai_tells,
      issues: raw.issues,
      hook_verdict,
      cta_verdict: 'generic',
      brand_voice_match: raw.brand_voice_match,
      audience_targeting: raw.audience_match,
      niche_specificity: raw.niche_fit,
    })
    const result: SlopDetection = {
      reads_as_human: scores.human_score >= REWRITE_SCORE_THRESHOLD,
      ai_tells_found: raw.ai_tells,
      worst_offending_phrase: raw.worst_offending_phrase,
      human_authenticity_score: scores.human_score,
    }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Slop detection failed' }, { status: 500 })
  }
}
