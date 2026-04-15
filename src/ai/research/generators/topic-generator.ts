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
          source_type: { type: ['string', 'null'] },
        },
        required: ['finding', 'suggested_theme', 'pillar', 'source_url', 'source_title', 'source_type'],
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

  console.log("Research User Prompt/n", userPrompt)
  console.log("Research System Prompt/n", systemPrompt)

  const message = await callAnthropic({
    systemPrompt,
    userMessage: userPrompt,
    model: DEFAULT_MODEL,
    outputSchema: TOPICS_OUTPUT_SCHEMA,
  })

  const { topics } = extractToolInput<{ topics: ResearchTopic[] }>(message)
  return topics
}
