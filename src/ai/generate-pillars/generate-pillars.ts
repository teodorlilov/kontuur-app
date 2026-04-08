import { sanitizePromptField, DEFENSIVE_DATA_CLAUSE } from '@/ai/utils/sanitize'

export interface GeneratePillarsInput {
  niche: string
  targetAudience: string
}

export interface GeneratePillarsResult {
  pillars: string[]
}

export function buildPillarsPrompt(input: GeneratePillarsInput): string {
  return `You are a social media strategist. ${DEFENSIVE_DATA_CLAUSE}

Suggest 5-7 content pillars for a ${sanitizePromptField(input.niche)} business targeting ${sanitizePromptField(input.targetAudience) || 'a general audience'}.

Content pillars are the main themes or topics a brand consistently posts about.

Return JSON only:
{
  "pillars": string[]
}`
}
