import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import {
  buildGenerateSystemPrompt,
  buildGenerateUserCarouselPrompt,
  buildRevisionPrompt,
} from '@/ai/generation/prompts/prompt-builder'
import { stripMarkdownArtifacts } from '@/ai/utils/sanitize'

import type { CarouselInput, CarouselResult } from '../types'
import type { SlideText } from '@/types/slide'

/**
 * Output schema pinned to the requested slide count. The count is a strong hint,
 * NOT a guarantee: the tool is declared without `strict: true`, and strict mode
 * does not support minItems/maxItems at all — hence the slide-count mismatch
 * warning the orchestrator still logs.
 */
function buildCarouselOutputSchema(slideCount: number) {
  return {
    type: 'object' as const,
    properties: {
      main_caption: { type: 'string' },
      slides: {
        type: 'array',
        minItems: slideCount,
        maxItems: slideCount,
        items: {
          type: 'object',
          properties: {
            headline: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['headline', 'body'],
        },
      },
    },
    required: ['main_caption', 'slides'],
  }
}

/** Assign slide_number and slide_role from array position. */
function enrichSlides(slides: SlideText[]): CarouselResult['slides'] {
  const roles: Array<'cover' | 'content' | 'cta'> = slides.map((_, i) =>
    i === 0 ? 'cover' : i === slides.length - 1 ? 'cta' : 'content'
  )
  return slides.map((s, i) => ({
    slide_number: i + 1,
    slide_role: roles[i],
    headline: s.headline,
    body: s.body,
  }))
}

export async function generateCarousel(
  input: CarouselInput,
  onToken?: (text: string) => void
): Promise<CarouselResult> {
  const systemPrompt = buildGenerateSystemPrompt(input.client, input.platform, 'carousel')
  const userMessage = buildGenerateUserCarouselPrompt(input)
  const outputSchema = buildCarouselOutputSchema(input.slideCount)

  const message = await callAnthropic({
    systemPrompt,
    userMessage,
    onToken,
    model: DEFAULT_MODEL,
    outputSchema,
    maxTokens: 4096,
  })
  const raw = extractToolInput<{ main_caption?: string; slides?: Array<{ headline?: string; body?: string }> }>(message, outputSchema)
  // Same unenforced-schema guard as reviseCarousel below: a truncated tool call
  // can omit either field, and destructuring it blind threw an opaque TypeError.
  if (typeof raw.main_caption !== 'string' || !Array.isArray(raw.slides)) {
    throw new Error('generateCarousel: model returned an incomplete carousel')
  }
  return {
    main_caption: stripMarkdownArtifacts(raw.main_caption),
    slides: enrichSlides(
      raw.slides.map((s) => ({
        headline: stripMarkdownArtifacts(s.headline ?? ''),
        body: stripMarkdownArtifacts(s.body ?? ''),
      }))
    ),
  }
}

/**
 * One bounded revision of a failed carousel. The draft is replayed as plain
 * serialized text — legal even though the original response was a tool_use
 * block, since no tool_result is sent — so the writer revises its own slides
 * with the cached system prefix reused. Returns null when the model returns
 * nothing usable; the caller keeps the original.
 */
export async function reviseCarousel(
  input: CarouselInput,
  draft: CarouselResult,
  notes: string[]
): Promise<CarouselResult | null> {
  const outputSchema = buildCarouselOutputSchema(input.slideCount)
  const draftText = JSON.stringify({
    main_caption: draft.main_caption,
    slides: draft.slides.map((s) => ({ headline: s.headline, body: s.body })),
  })

  const message = await callAnthropic({
    systemPrompt: buildGenerateSystemPrompt(input.client, input.platform, 'carousel'),
    userMessage: buildRevisionPrompt(notes),
    conversationHistory: [
      { role: 'user', content: buildGenerateUserCarouselPrompt(input) },
      { role: 'assistant', content: draftText },
    ],
    model: DEFAULT_MODEL,
    outputSchema,
    maxTokens: 4096,
  })
  const raw = extractToolInput<{ main_caption: string; slides: SlideText[] }>(message, outputSchema)
  if (!raw.main_caption || !Array.isArray(raw.slides) || raw.slides.length === 0) return null
  return {
    main_caption: stripMarkdownArtifacts(raw.main_caption),
    slides: enrichSlides(
      raw.slides.map((s) => ({
        headline: stripMarkdownArtifacts(s.headline),
        body: stripMarkdownArtifacts(s.body),
      }))
    ),
  }
}
