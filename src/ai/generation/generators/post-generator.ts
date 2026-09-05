import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  buildRevisionPrompt,
} from '@/ai/generation/prompts/prompt-builder'
import { stripMarkdownArtifacts } from '@/ai/utils/sanitize'
import type { SinglePostInput } from '../types'

export interface ParsedPost {
  caption: string
}

/**
 * Output schema pinned to the requested post count. The count is a strong hint,
 * NOT a guarantee: the tool is declared without `strict: true`, and strict mode
 * does not support minItems/maxItems at all — so the model can still return the
 * wrong number. Callers must handle a short or long array.
 */
function buildPostsOutputSchema(count: number) {
  return {
    type: 'object' as const,
    properties: {
      posts: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          properties: { caption: { type: 'string' } },
          required: ['caption'],
        },
      },
    },
    required: ['posts'],
  }
}

export async function generatePost(
  input: SinglePostInput,
  onToken?: (text: string) => void
): Promise<ParsedPost[]> {
  const systemPrompt = buildGenerateSystemPrompt(input.client, 'single')
  const userMessage = buildGenerateUserPrompt(input)
  const outputSchema = buildPostsOutputSchema(input.count)

  // Schema-forced like the carousel path. Free text split on "---" let the model
  // drift into document mode — markdown headings, even a whole carousel written
  // out as caption text — and sheared any caption legitimately containing "---".
  // Truncated tool input fails loudly instead of silently dropping posts, so the
  // budget scales with the requested count.
  const message = await callAnthropic({
    systemPrompt,
    userMessage,
    onToken,
    model: DEFAULT_MODEL,
    outputSchema,
    maxTokens: 1200 * input.count,
  })
  const { posts } = extractToolInput<{ posts?: Array<{ caption?: string }> }>(message, outputSchema)
  // The schema is unenforced (see buildPostsOutputSchema), so a truncated or
  // malformed tool call can omit `posts` entirely. Destructuring it blind threw
  // an opaque TypeError that Promise.allSettled swallowed as "theme failed".
  if (!Array.isArray(posts)) {
    throw new Error('generatePost: model returned no posts array')
  }
  return posts
    .map(({ caption }) => ({ caption: stripMarkdownArtifacts((caption ?? '').trim()) }))
    .filter(({ caption }) => caption.length > 0)
}

/**
 * One bounded revision of a failed draft. Replays the original turn plus the
 * draft via conversationHistory — the cached system prefix is reused and the
 * writer revises its own work instead of writing blind. Returns null when the
 * model returns nothing usable; the caller keeps the original.
 */
export async function revisePost(
  input: SinglePostInput,
  draftCaption: string,
  notes: string[]
): Promise<string | null> {
  const outputSchema = buildPostsOutputSchema(1)
  const message = await callAnthropic({
    systemPrompt: buildGenerateSystemPrompt(input.client, 'single'),
    userMessage: buildRevisionPrompt(notes),
    conversationHistory: [
      { role: 'user', content: buildGenerateUserPrompt(input) },
      { role: 'assistant', content: draftCaption },
    ],
    model: DEFAULT_MODEL,
    outputSchema,
    maxTokens: 1200,
  })
  const { posts } = extractToolInput<{ posts: Array<{ caption: string }> }>(message, outputSchema)
  const caption = stripMarkdownArtifacts((posts[0]?.caption ?? '').trim())
  return caption.length > 0 ? caption : null
}
