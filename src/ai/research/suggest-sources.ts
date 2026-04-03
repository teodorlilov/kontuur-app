import { anthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'

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
  return `Suggest 5 real RSS feed URLs for a social media content strategist managing a client in this niche: ${input.niche}.

Focus on: industry news blogs, professional associations, respected niche publications, trade journals.
Only suggest URLs that are very likely to be real and currently active — do not invent URLs.
 
Return JSON only, no markdown wrapper:
[{ "url": string, "label": string, "reason": string }]`
}

export async function suggestSources(input: SuggestSourcesInput): Promise<SuggestedSource[]> {
  const message = await anthropic.messages.create({
    model: LIGHT_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  })

  return parseJsonResponse<SuggestedSource[]>(message, 'array')
}
