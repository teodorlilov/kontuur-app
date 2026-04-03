import type { Message } from '@anthropic-ai/sdk/resources'
import { callAnthropic } from '@/utils/ai-client'
import {
  buildStaticSystemPrompt,
  buildClientProfile,
  buildAngleVariationPrompt,
} from '@/ai/generation/prompts/client-profile'
import { buildGroundingPrompt } from '@/ai/generation/prompts/source-grounding'
import { PROMPT_HISTORY_LIMIT } from '@/utils/constants'
import type { GenerationInput } from '../types'

/**
 * Abstract base for all content generators.
 *
 * Subclasses implement:
 *   buildDirective(input) — content-type-specific directive
 *   parseResponse(msg, input)       — extract typed result from API response
 *
 * Subclasses may override:
 *   buildSystemPrompt()  — when a content type needs a different system prompt
 *                          (e.g. Reels uses a script-writing system prompt)
 *   getPlatform()        — platform passed to buildClientProfile
 *   getContentLabel()    — label passed to buildGroundingPrompt
 */
export abstract class ContentGenerator<
  TInput extends GenerationInput,
  TOutput
> {
  /**
   * The single public entry point.
   * Orchestrates: system prompt → user message → API call → parse.
   */
  async generate(input: TInput): Promise<TOutput> {
    const systemPrompt = this.buildSystemPrompt(input)
    const userMessage = this.buildUserMessage(input)
    const message = await this.callAnthropic(systemPrompt, userMessage)
    return this.parseResponse(message, input)
  }

  /**
   * Builds the system prompt.
   * Default: static system prompt identical for all clients, globally cached.
   * Override in subclasses that need a different system prompt (e.g. ReelsGenerator).
   */
  protected buildSystemPrompt(_input: TInput): string {
    return buildStaticSystemPrompt()
  }

  /**
   * Platform passed to buildClientProfile.
   * Default: reads from input.platform (falls back to 'Instagram').
   * CarouselGenerator and ReelsGenerator override to return 'Instagram' explicitly.
   */
  protected getPlatform(input: TInput): string {
    return (input as { platform?: string }).platform ?? 'Instagram'
  }

  /**
   * Content label passed to buildGroundingPrompt.
   * Default: 'caption'. Override per content type (e.g. 'script' for reels).
   */
  protected getContentLabel(): string {
    return 'caption'
  }

  /**
   * Concrete — assembles the shared wrapper sections and appends
   * the subclass-specific directive from buildDirective.
   */
  protected buildUserMessage(input: TInput): string {
    const profile = buildClientProfile({
      client: input.client,
      platform: this.getPlatform(input),
      targetPillar: input.targetPillar,
    })

    const history = input.client.postHistory.length > 0
      ? `Recent topics already covered — do not repeat: ${
          input.client.postHistory.slice(0, PROMPT_HISTORY_LIMIT).join(' | ')
        }`
      : ''

    const source = buildGroundingPrompt({
      sourceExcerpt: input.sourceExcerpt,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
      contentLabel: this.getContentLabel(),
    })

    const angleDiff = buildAngleVariationPrompt(input.similarPastThemes ?? [])
    const today = `Today's date: ${new Date().toISOString().split('T')[0]}`
    const directive = this.buildDirective(input)

    return [profile, history, source, angleDiff, today, directive]
      .filter(Boolean)
      .join('\n\n')
  }

  /**
   * Content-type-specific directive appended after the shared sections.
   * Each subclass defines only what is unique to its content type.
   */
  protected abstract buildDirective(input: TInput): string

  /**
   * Parses the raw Anthropic API response into the typed output.
   * Each subclass knows its own output format.
   */
  protected abstract parseResponse(message: Message, input: TInput): TOutput

  /**
   * Shared Anthropic API call with system prompt caching.
   * Private — subclasses never call this directly.
   */
  private async callAnthropic(systemPrompt: string, userMessage: string): Promise<Message> {
    return callAnthropic({ systemPrompt, userMessage })
  }
}
