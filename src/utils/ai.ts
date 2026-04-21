import { jsonrepair } from 'jsonrepair'
import type Anthropic from '@anthropic-ai/sdk'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources'

/**
 * Extracts the structured input from a tool_use response block.
 * Accepts the same outputSchema passed to callAnthropic so it can coerce any
 * field the model mistakenly returns as a JSON-encoded string back to its proper type.
 */
export function extractToolInput<T>(
  message: Anthropic.Message,
  schema?: { properties?: Record<string, { type?: string | string[] }> }
): T {
  const block = message.content.find((b): b is ToolUseBlock => b.type === 'tool_use')
  if (!block) throw new Error('[extractToolInput] No tool_use block in response')
  const input = block.input as Record<string, unknown>
  if (schema?.properties) {
    for (const [key, def] of Object.entries(schema.properties)) {
      if (def.type === 'array' && typeof input[key] === 'string') {
        input[key] = sanitizeAndParseJson(input[key] as string, [], 'array')
      }
    }
  }
  return input as T
}
import type { UrlAnalysisResponse } from '@/types/api'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { buildAnalyzeUrlPrompt, type AnalyzeUrlInput } from '@/ai/analyze-url/analyze-url'

export function extractTextFromMessage(message: Anthropic.Message): string {
  const block = message.content[0]
  return block?.type === 'text' ? block.text : ''
}

export function parseJsonResponse<T>(
  message: Anthropic.Message,
  mode: 'object' | 'array' = 'object',
  /** Prepend this string before parsing — use when assistantPrefill was set (e.g. '[') */
  prefill?: string
): T {
  const text = extractTextFromMessage(message)
  const withPrefill = prefill ? prefill + text : text
  const fallback = (mode === 'array' ? [] : {}) as T
  return sanitizeAndParseJson<T>(withPrefill, fallback, mode)
}

export function stripPlanningPrefix(text: string): string {
  const primaryPattern = /^\[STRUCTURE:\s*[^\]]+(?:\||,)\s*OPENER:\s*[^\]]+\]\s*/i
  const primaryMatch = text.match(primaryPattern)
  if (primaryMatch) {
    return text.slice(primaryMatch[0].length)
  }

  const lines = text.split('\n')
  const firstLine = lines[0]?.trim() ?? ''
  if (
    firstLine.startsWith('[') &&
    firstLine.endsWith(']') &&
    firstLine.toUpperCase().includes('STRUCTURE') &&
    firstLine.toUpperCase().includes('OPENER')
  ) {
    return lines.slice(1).join('\n').trim()
  }

  return text
}

export function sanitizeAndParseJson<T>(raw: string, fallback: T, mode?: 'object' | 'array'): T {
  const stripped = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')

  let match: RegExpMatchArray | null
  if (mode === 'array') {
    match = stripped.match(/\[[\s\S]*\]/)
  } else if (mode === 'object') {
    match = stripped.match(/\{[\s\S]*\}/)
  } else {
    match = stripped.match(/\{[\s\S]*\}/) ?? stripped.match(/\[[\s\S]*\]/)
  }
  if (!match) return fallback

  const json = match[0]

  try {
    return JSON.parse(json) as T
  } catch {
    try {
      return JSON.parse(jsonrepair(json)) as T
    } catch (err) {
      console.warn(
        '[sanitizeAndParseJson] Failed to parse LLM JSON:',
        err,
        '\nExtracted (first 500):',
        json.slice(0, 500)
      )
      return fallback
    }
  }
}

export async function analyzeUrl(input: AnalyzeUrlInput): Promise<UrlAnalysisResponse> {
  const message = await callAnthropic({
    model: LIGHT_MODEL,
    maxTokens: 2048,
    userMessage: buildAnalyzeUrlPrompt(input),
  })

  return parseJsonResponse<UrlAnalysisResponse>(message)
}
