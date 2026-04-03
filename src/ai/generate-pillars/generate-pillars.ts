export interface GeneratePillarsInput {
  niche: string
  targetAudience: string
}

export interface GeneratePillarsResult {
  pillars: string[]
}

export function buildPillarsPrompt(input: GeneratePillarsInput): string {
  return `You are a social media strategist. Suggest 5-7 content pillars for a ${input.niche} business targeting ${input.targetAudience || 'a general audience'}.

Content pillars are the main themes or topics a brand consistently posts about.

Return JSON only:
{
  "pillars": string[]
}`
}
