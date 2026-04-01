import { anthropic, LIGHT_MODEL } from '@/ai/client'
import { parseJsonResponse } from '@/ai/utils'

export interface GeneratePillarsInput {
  niche: string
  targetAudience: string
}

export interface GeneratePillarsResult {
  pillars: string[]
}

function buildPrompt(input: GeneratePillarsInput): string {
  return `You are a social media strategist. Suggest 5-7 content pillars for a ${input.niche} business targeting ${input.targetAudience || 'a general audience'}.

Content pillars are the main themes or topics a brand consistently posts about.

Return JSON only:
{
  "pillars": string[]
}`
}

export async function generatePillars(input: GeneratePillarsInput): Promise<GeneratePillarsResult> {
  const message = await anthropic.messages.create({
    model: LIGHT_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  })

  return parseJsonResponse<GeneratePillarsResult>(message)
}
