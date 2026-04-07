import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'

export interface GenerateSummaryInput {
  clientName: string
  platform: string
  startDate: string
  endDate: string
  metricsJson: unknown
}

/**
 * Generates a 4–5 sentence analytics summary for a client's social media report.
 * Covers overall trend, best content, audience insight, and one actionable recommendation.
 */
export async function generateAnalyticsSummary(input: GenerateSummaryInput): Promise<string> {
  const { clientName, platform, startDate, endDate, metricsJson } = input

  const userMessage = `You are a social media analyst writing a report summary for a marketing agency.

Given these metrics for ${clientName}'s ${platform} account for ${startDate} to ${endDate}, write a concise 4-5 sentence summary covering:
- Overall performance trend
- Best performing content type or post and why
- Audience or engagement insight worth highlighting
- One specific actionable recommendation for next period

Professional tone, flowing prose, no bullet points, no markdown formatting, no headings.
Metrics: ${JSON.stringify(metricsJson, null, 2)}`

  const response = await callAnthropic({
    userMessage,
    model: LIGHT_MODEL,
    maxTokens: 512,
    cacheSystemPrompt: false,
  })

  const block = response.content[0]
  return block?.type === 'text' ? block.text.trim() : ''
}
