import type Anthropic from '@anthropic-ai/sdk'
import type { UrlAnalysisResponse } from '@/types/api'
import { anthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { buildAnalyzeUrlPrompt, type AnalyzeUrlInput } from '@/ai/analyze-url/analyze-url'
import { buildPillarsPrompt, type GeneratePillarsInput, type GeneratePillarsResult } from '@/ai/generate-pillars/generate-pillars'

export function extractTextFromMessage(message: Anthropic.Message): string {
  const block = message.content[0]
  return block?.type === 'text' ? block.text : ''
}

export function parseJsonResponse<T>(message: Anthropic.Message, mode: 'object' | 'array' = 'object'): T {
  const text = extractTextFromMessage(message)
  const pattern = mode === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/
  const match = text.match(pattern)
  const fallback = mode === 'array' ? '[]' : '{}'
  try {
    return JSON.parse(match?.[0] ?? fallback) as T
  } catch (err) {
    console.warn('[parseJsonResponse] Failed to parse LLM JSON, returning fallback:', err)
    return JSON.parse(fallback) as T
  }
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

export function sanitizeAndParseJson<T>(raw: string, fallback: T): T {
  const stripped = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')
  const match = stripped.match(/\{[\s\S]*\}/) ?? stripped.match(/\[[\s\S]*\]/)
  if (!match) return fallback
  const json = match[0].replace(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(json) as T
  } catch (err) {
    console.warn('[sanitizeAndParseJson] Failed to parse LLM JSON:', err)
    return fallback
  }
}

export async function analyzeUrl(input: AnalyzeUrlInput): Promise<UrlAnalysisResponse> {
  const message = await anthropic.messages.create({
    model: LIGHT_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: buildAnalyzeUrlPrompt(input) }],
  })

  return parseJsonResponse<UrlAnalysisResponse>(message)
}

export async function generatePillars(input: GeneratePillarsInput): Promise<GeneratePillarsResult> {
  const message = await anthropic.messages.create({
    model: LIGHT_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPillarsPrompt(input) }],
  })

  return parseJsonResponse<GeneratePillarsResult>(message)
}
