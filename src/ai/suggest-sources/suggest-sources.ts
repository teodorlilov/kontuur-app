import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { sanitizePromptField, DEFENSIVE_DATA_CLAUSE } from '@/ai/utils/sanitize'

export interface SuggestSourcesInput {
  niche: string
  clientName?: string
}

export interface SuggestedSource {
  url: string
  label: string
  reason: string
}

function buildPrompt(input: SuggestSourcesInput): string {
  return `Suggest 5 real RSS feed URLs for a social media content strategist managing a client in this niche: ${sanitizePromptField(input.niche)}.

Focus on: industry news blogs, professional associations, respected niche publications, trade journals.
Only suggest URLs that are very likely to be real and currently active — do not invent URLs.

Return JSON only, no markdown wrapper:
[{ "url": string, "label": string, "reason": string }]`
}

export async function suggestSources(input: SuggestSourcesInput): Promise<SuggestedSource[]> {
  const message = await callAnthropic({
    model: LIGHT_MODEL,
    maxTokens: 1024,
    systemPrompt: `You are a research assistant. ${DEFENSIVE_DATA_CLAUSE}`,
    userMessage: buildPrompt(input),
  })

  return parseJsonResponse<SuggestedSource[]>(message, 'array')
}
