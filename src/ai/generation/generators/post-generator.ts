import { callAnthropic, DEFAULT_MODEL, LIGHT_MODEL } from '@/utils/ai-client'
import { buildGenerateSystemPrompt, buildGenerateUserPrompt } from '@/ai/generation/prompts/prompt-builder'
import type { SinglePostInput } from '../types'

export interface ParsedPost {
  caption: string
  declaredStructure: string | null
}

/**
 * Extracts the [STRUCTURE: name] declaration from the planning step.
 * Returns the structure name and the clean caption without the declaration line.
 */
function parsePostDeclaration(text: string): ParsedPost {
  const match = text.match(/^\[STRUCTURE:\s*([^\]|]+?)(?:\s*[|,][^\]]*)?\]\s*/i)
  if (match?.[1]) {
    return {
      declaredStructure: match[1].trim(),
      caption: text.slice(match[0].length).trim(),
    }
  }

  const lines = text.split('\n')
  const firstLine = (lines[0] ?? '').trim()
  if (
    firstLine.startsWith('[') &&
    firstLine.endsWith(']') &&
    firstLine.toUpperCase().includes('STRUCTURE')
  ) {
    const structMatch = firstLine.match(/STRUCTURE:\s*([^\]|,]+)/i)
    return {
      declaredStructure: structMatch?.[1]?.trim() ?? null,
      caption: lines.slice(1).join('\n').trim(),
    }
  }

  return { declaredStructure: null, caption: text.trim() }
}

export async function generatePost(
  input: SinglePostInput,
  onToken?: (text: string) => void
): Promise<ParsedPost[]> {
  const systemPrompt = buildGenerateSystemPrompt(input.client, input.platform, input.targetPillar)
  const userMessage = buildGenerateUserPrompt(input)


  console.log("Generate system prompt is ", systemPrompt)
  console.log("Generate user prompt is ", userMessage)

  const message = await callAnthropic({ systemPrompt, userMessage, onToken, model: DEFAULT_MODEL })
  const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
  return text
    .split('---')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(parsePostDeclaration)
}
