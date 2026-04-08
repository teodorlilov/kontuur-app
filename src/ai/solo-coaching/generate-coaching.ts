import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { sanitizeAndParseJson, extractTextFromMessage } from '@/utils/ai'

export interface SoloCoachingInput {
  niche: string
  pendingCount: number
}

export interface SoloCoachingResult {
  coaching_points: string[]
}

export async function generateSoloCoaching(input: SoloCoachingInput): Promise<SoloCoachingResult> {
  const message = await callAnthropic({
    model: LIGHT_MODEL,
    maxTokens: 512,
    userMessage: `You are a friendly social media coach for a solo business owner in the ${input.niche} niche. They have ${input.pendingCount} post${input.pendingCount === 1 ? '' : 's'} waiting for review.

Give them 3 short, actionable bullet points to make the most of their content this week. Plain language, no jargon.

Return JSON only:
{ "coaching_points": ["<point 1>", "<point 2>", "<point 3>"] }`,
    assistantPrefill: '{',
  })

  const raw = '{' + extractTextFromMessage(message)
  const parsed = sanitizeAndParseJson<SoloCoachingResult>(raw, { coaching_points: [] })

  if (!Array.isArray(parsed.coaching_points) || parsed.coaching_points.length === 0) {
    return { coaching_points: [] }
  }

  return parsed
}
