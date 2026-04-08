import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import type { BestTimePlatform } from '@/types/api'
import { sanitizePromptField, PROMPT_FIELD_LIMITS, DEFENSIVE_DATA_CLAUSE } from '@/ai/utils/sanitize'

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
  return `You are a social media strategist. ${DEFENSIVE_DATA_CLAUSE}

Based on this client's profile, determine the best times to post on each of their active platforms.

Client profile:
Niche: ${sanitizePromptField(input.niche)} | Audience: ${sanitizePromptField(input.targetAudience)}
Language: ${sanitizePromptField(input.language, PROMPT_FIELD_LIMITS.short)}
Active platforms: ${sanitizePromptField(input.platforms, PROMPT_FIELD_LIMITS.short)}

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
  const message = await callAnthropic({
    model: LIGHT_MODEL,
    maxTokens: 2048,
    userMessage: buildPrompt(input),
  })

  return parseJsonResponse<BestTimeResult>(message)
}
