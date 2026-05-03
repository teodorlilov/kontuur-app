import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { buildGenerateSystemPrompt, buildGenerateUserPrompt } from '@/ai/generation/prompts/prompt-builder'
import type { SinglePostInput } from '../types'

export interface ParsedPost {
  caption: string
}

export async function generatePost(
  input: SinglePostInput,
  onToken?: (text: string) => void
): Promise<ParsedPost[]> {
  const systemPrompt = buildGenerateSystemPrompt(input.client, input.platform, input.targetPillar)
  const userMessage = buildGenerateUserPrompt(input)

  const message = await callAnthropic({ systemPrompt, userMessage, onToken, model: DEFAULT_MODEL, maxTokens: 1200 })
  const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
  return text
    .split('---')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((caption) => ({ caption }))
}
