import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { checkRateLimit, AI_RATE_LIMIT } from '@/lib/auth/rate-limit'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractTextFromMessage } from '@/utils/ai'
import { sanitizePromptField, PROMPT_FIELD_LIMITS } from '@/ai/utils/sanitize'

export async function POST(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { userId } = auth

  const rl = checkRateLimit(`ai:intelligence:tip:${userId}`, AI_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }

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
