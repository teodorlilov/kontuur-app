import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'

interface GenerateSummaryInput {
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

  const userMessage = `You are the editor of a social media report for a marketing agency. The dashboard below your words already shows every number, so you never recite data — you say what it means.

Given these metrics for ${clientName}'s ${platform} account for ${startDate} to ${endDate}, write the report's opening statement:

- 2 to 3 sentences, 70 words maximum. This is a pull-quote, not an analysis.
- Sentence 1: the single most important movement this period and what drove it.
- Sentence 2: the most useful secondary insight (a format, a behavior, an audience shift).
- Optional sentence 3: one concrete recommendation for the next period.
- Name at most two figures in total; round them (say "five times the reach", not "4,937.4%").
- Plain confident prose. No preamble, no dates, no bullet points, no markdown.
Metrics: ${JSON.stringify(metricsJson, null, 2)}`

  const response = await callAnthropic({
    userMessage,
    model: LIGHT_MODEL,
    maxTokens: 320,
    cacheSystemPrompt: false,
  })

  const block = response.content[0]
  return block?.type === 'text' ? block.text.trim() : ''
}
