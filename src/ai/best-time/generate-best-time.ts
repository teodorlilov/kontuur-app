import { anthropic, LIGHT_MODEL } from '@/ai/client'
import { parseJsonResponse } from '@/ai/utils'
import type { BestTimePlatform } from '@/types/api'

export interface BestTimeInput {
  niche: string
  targetAudience: string
  language: string
  platforms: string
}

export interface BestTimeResult {
  platforms: BestTimePlatform[]
  upgrade_note: string
}

function buildPrompt(input: BestTimeInput): string {
  return `You are a social media strategist. Based on this client's profile, determine the best times to post on each of their active platforms.

Client profile:
Niche: ${input.niche} | Audience: ${input.targetAudience}
Language: ${input.language}
Active platforms: ${input.platforms}

For each platform, reason from first principles about:
- When this specific target audience is most likely online based on their lifestyle and daily patterns
- What day of week fits their behaviour (work, commute, leisure)
- Cultural or seasonal factors for this market and language
- Platform-specific usage patterns for this audience type

Return JSON only:
{
  "platforms": [{
    "platform": string,
    "best_days": string[],
    "best_time_windows": [{
      "time": string,
      "label": string,
      "reason": string
    }],
    "avoid": string,
    "confidence": "research-backed" | "ai-derived",
    "reasoning_summary": string
  }],
  "upgrade_note": string
}`
}

export async function generateBestTime(input: BestTimeInput): Promise<BestTimeResult> {
  const message = await anthropic.messages.create({
    model: LIGHT_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  })

  return parseJsonResponse<BestTimeResult>(message)
}
