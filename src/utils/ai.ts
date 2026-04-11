import { jsonrepair } from 'jsonrepair'
import type Anthropic from '@anthropic-ai/sdk'
import type { UrlAnalysisResponse } from '@/types/api'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { buildAnalyzeUrlPrompt, type AnalyzeUrlInput } from '@/ai/analyze-url/analyze-url'
import {
  buildPillarsPrompt,
  type GeneratePillarsInput,
  type GeneratePillarsResult,
} from '@/ai/generate-pillars/generate-pillars'

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

export async function generatePillars(input: GeneratePillarsInput): Promise<GeneratePillarsResult> {
  const message = await callAnthropic({
    model: LIGHT_MODEL,
    maxTokens: 1024,
    userMessage: buildPillarsPrompt(input),
  })

  return parseJsonResponse<GeneratePillarsResult>(message)
}
