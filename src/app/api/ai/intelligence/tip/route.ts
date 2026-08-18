import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { aiRateLimitResponse } from '@/lib/auth/rate-limit'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractTextFromMessage } from '@/utils/ai'
import { sanitizePromptField, PROMPT_FIELD_LIMITS } from '@/ai/utils/sanitize'

/**
 * `topic` is optional and the body may be absent entirely, so the schema is permissive
 * about presence — but not about type. It used to be read through a bare
 * `as { topic?: string }`, which asserts rather than checks: a number reached
 * `sanitizePromptField`, whose `.trim()` would have thrown inside the handler.
 */
const tipSchema = z.object({ topic: z.string().optional() })

/** One short coaching tip for the dashboard briefing bar. Rate-limited — it is a nicety, not a page dependency. */
export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { userId } = auth

  const limited = aiRateLimitResponse('intelligence:tip', userId)
  if (limited) return limited

  const parsed = tipSchema.safeParse(await request.json().catch(() => null))
  const topic = parsed.success ? parsed.data.topic : undefined

  const sanitizedTopic = topic ? sanitizePromptField(topic, PROMPT_FIELD_LIMITS.short) : undefined
  const prompt = sanitizedTopic
    ? `Give one practical 2-sentence social media tip about ${sanitizedTopic}. Be specific and actionable.`
    : `Give one practical 2-sentence social media tip about content strategy. Be specific and actionable.`

  const message = await callAnthropic({ model: LIGHT_MODEL, maxTokens: 256, userMessage: prompt })

  return NextResponse.json({ tip: extractTextFromMessage(message) })
}
