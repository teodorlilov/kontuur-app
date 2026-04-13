import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import type { ResearchPromptBuilder } from '../prompts/prompt-builder'
import type { ResearchTopic, SourceContext } from '../types'

export async function generateTopics(
  builder: ResearchPromptBuilder,
  count: number,
  sourceContext?: SourceContext
): Promise<ResearchTopic[]> {
  const userPrompt = builder.buildResearchUserPrompt(count, sourceContext)
  const systemPrompt = builder.systemPrompt

  console.log('Research User Prompt', userPrompt)
  console.log("Research System Prompt", systemPrompt)
  
  const message = await callAnthropic({
    systemPrompt: systemPrompt,
    userMessage: userPrompt,
    model: LIGHT_MODEL,
    assistantPrefill: '[',
  })

  return parseJsonResponse<ResearchTopic[]>(message, 'array', '[')
}
