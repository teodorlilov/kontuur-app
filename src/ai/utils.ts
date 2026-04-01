import type Anthropic from '@anthropic-ai/sdk'

/**
 * Extract text content from an Anthropic message response.
 */
export function extractTextFromMessage(message: Anthropic.Message): string {
  const block = message.content[0]
  return block?.type === 'text' ? block.text : ''
}

/**
 * Parse a JSON object or array from an Anthropic message response.
 * Handles responses that may contain markdown wrappers or extra text.
 */
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

/**
 * Sanitize raw LLM text and parse as JSON with fallback.
 * Handles markdown code fences and trailing commas.
 * Use when you need to parse from raw text (e.g., with prefilled assistant responses).
 */
/**
 * Strips the planning declaration [STRUCTURE: X | OPENER: Y] from the start
 * of a generated post. Handles common formatting variations from the LLM.
 */
export function stripPlanningPrefix(text: string): string {
  // Primary pattern: [STRUCTURE: ... | OPENER: ...] or [STRUCTURE: ..., OPENER: ...]
  const primaryPattern = /^\[STRUCTURE:\s*[^\]]+(?:\||,)\s*OPENER:\s*[^\]]+\]\s*/i
  const primaryMatch = text.match(primaryPattern)
  if (primaryMatch) {
    return text.slice(primaryMatch[0].length)
  }

  // Fallback: first line is a bracket declaration containing both keywords
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

  // No declaration found — return text unchanged
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
