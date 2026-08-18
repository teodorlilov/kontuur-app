import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractTextFromMessage } from '@/utils/ai'
import { sanitizePromptField, PROMPT_FIELD_LIMITS } from '@/ai/utils/sanitize'

/** One short coaching tip for the dashboard briefing bar. Rate-limited — it is a nicety, not a page dependency. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { userId } = auth

  const limited = aiRateLimitResponse('intelligence:tip', userId)
  if (limited) return limited

  let topic: string | undefined
  try {
    const body = (await request.json()) as { topic?: string }
    topic = body.topic
  } catch {
    // topic is optional — ignore parse errors
  }

  const sanitizedTopic = topic ? sanitizePromptField(topic, PROMPT_FIELD_LIMITS.short) : undefined
  const prompt = sanitizedTopic
    ? `Give one practical 2-sentence social media tip about ${sanitizedTopic}. Be specific and actionable.`
    : `Give one practical 2-sentence social media tip about content strategy. Be specific and actionable.`

  const message = await callAnthropic({ model: LIGHT_MODEL, maxTokens: 256, userMessage: prompt })

  return NextResponse.json({ tip: extractTextFromMessage(message) })
}
