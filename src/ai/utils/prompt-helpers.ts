import { PROMPT_HISTORY_LIMIT } from '@/utils/constants'

/** Returns today's date as YYYY-MM-DD. Used in prompts. */
export function todayDateString(): string {
  return new Date().toISOString().split('T')[0]!
}

/** Formats post history for prompt inclusion. Applies entry limit and pipe/bullet format. */
export function formatHistory(
  history: string[],
  opts?: { limit?: number; format?: 'pipe' | 'bullets' },
): string {
  if (history.length === 0) return ''
  const limit = opts?.limit ?? PROMPT_HISTORY_LIMIT
  const format = opts?.format ?? 'pipe'
  const entries = history.slice(0, limit)
  return format === 'bullets'
    ? entries.map((t) => `- ${t}`).join('\n')
    : entries.join(' | ')
}
