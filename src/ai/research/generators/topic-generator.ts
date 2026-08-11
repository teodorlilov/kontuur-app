import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import type { ResearchPromptBuilder } from '../prompts/prompt-builder'
import type { ResearchTopic, SourceContext, TopicBrief } from '../types'

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
          // 1-based index of the requested post this topic serves, null when the
          // model chose the topic itself. Required so the caller can map results
          // back without relying on response ordering.
          brief_index: { type: ['integer', 'null'] },
          pillar: { type: ['string', 'null'] },
          source_url: { type: ['string', 'null'] },
          source_title: { type: ['string', 'null'] },
          source_type: { type: ['string', 'null'] },  // 'rss' | 'website' | 'file' | 'web_search' | 'performance' | null
          source_excerpt: { type: 'string' },
        },
        required: ['finding', 'suggested_theme', 'brief_index', 'pillar', 'source_url', 'source_title', 'source_type', 'source_excerpt'],
      },
    },
  },
  required: ['topics'],
}

/**
 * Plan a whole run in one call: a topic for each user-supplied brief, plus
 * `researchCount` the model chooses from what is left.
 *
 * One call rather than two so the model cannot give the same source to a brief and
 * to a researched topic — neither pass would know what the other had taken.
 */
export async function generateTopics(
  builder: ResearchPromptBuilder,
  plan: { briefs: readonly TopicBrief[]; researchCount: number },
  sourceContext?: SourceContext
): Promise<ResearchTopic[]> {
  const message = await callAnthropic({
    systemPrompt: builder.systemPrompt,
    userMessage: builder.buildTopicPlanPrompt(plan, sourceContext),
    model: DEFAULT_MODEL,
    outputSchema: TOPICS_OUTPUT_SCHEMA,
  })

  const { topics } = extractToolInput<{ topics: ResearchTopic[] }>(message, TOPICS_OUTPUT_SCHEMA)
  return topics
}
