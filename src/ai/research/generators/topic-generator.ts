import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import type { ResearchPromptBuilder } from '../prompts/prompt-builder'
import type { ResearchTopic, SourceContext } from '../types'

const TOPICS_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string' },
          suggested_theme: { type: 'string' },
          pillar: { type: ['string', 'null'] },
          source_url: { type: ['string', 'null'] },
          source_title: { type: ['string', 'null'] },
          source_type: { type: ['string', 'null'] },  // 'rss' | 'website' | 'file' | 'web_search' | 'performance' | null
          source_excerpt: { type: 'string' },
        },
        required: ['finding', 'suggested_theme', 'pillar', 'source_url', 'source_title', 'source_type', 'source_excerpt'],
      },
    },
  },
  required: ['topics'],
}

export async function generateTopics(
  builder: ResearchPromptBuilder,
  count: number,
  sourceContext?: SourceContext
): Promise<ResearchTopic[]> {
  const userPrompt = builder.buildResearchUserPrompt(count, sourceContext)
  const systemPrompt = builder.systemPrompt

  const message = await callAnthropic({
    systemPrompt,
    userMessage: userPrompt,
    model: DEFAULT_MODEL,
    outputSchema: TOPICS_OUTPUT_SCHEMA,
  })

  const { topics } = extractToolInput<{ topics: ResearchTopic[] }>(message, TOPICS_OUTPUT_SCHEMA)
  return topics
}

/**
 * Ask for replacement topics when the grounding filter rejected part of the
 * first response — continues the original conversation so the (cached) system
 * prompt and source material are reused instead of re-sent as a fresh prompt.
 */
export async function generateTopUpTopics(
  builder: ResearchPromptBuilder,
  count: number,
  shortfall: number,
  sourceContext: SourceContext | undefined,
  firstResponseTopics: ResearchTopic[],
  keptThemes: string[]
): Promise<ResearchTopic[]> {
  const originalUserPrompt = builder.buildResearchUserPrompt(count, sourceContext)

  const message = await callAnthropic({
    systemPrompt: builder.systemPrompt,
    conversationHistory: [
      { role: 'user', content: originalUserPrompt },
      { role: 'assistant', content: JSON.stringify({ topics: firstResponseTopics }) },
    ],
    userMessage: `${shortfall} of your topics were rejected because they lacked a valid source_url from the SOURCE MATERIAL above.
Provide exactly ${shortfall} additional topic(s), each grounded in the source material with a valid source_url.
Do not repeat any of these themes: ${keptThemes.map((t) => `"${t}"`).join(', ') || '(none kept)'}`,
    model: DEFAULT_MODEL,
    outputSchema: TOPICS_OUTPUT_SCHEMA,
  })

  const { topics } = extractToolInput<{ topics: ResearchTopic[] }>(message, TOPICS_OUTPUT_SCHEMA)
  return topics
}
