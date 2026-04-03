import type { Message } from '@anthropic-ai/sdk/resources'
import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from '@/utils/ai-client'
import { buildStaticSystemPrompt } from '@/ai/generation/prompts/prompt-sections'
import type { BaseGenerateInput } from './types'

/**
 * Abstract base for all content generators.
 *
 * Subclasses implement:
 *   buildUserMessage(input)  — client-specific user message
 *   parseResponse(msg, input) — extract typed result from API response
 *
 * Subclasses may override:
 *   buildSystemPrompt()       — when a content type needs a different system prompt
 *                               (e.g. Reels uses a script-writing system prompt)
 */
export abstract class ContentGenerator<
  TInput extends BaseGenerateInput,
  TOutput
> {
  /**
   * The single public entry point.
   * Orchestrates: system prompt → user message → API call → parse.
   */
  async generate(input: TInput): Promise<TOutput> {
    const systemPrompt = this.buildSystemPrompt(input)
    const userMessage = this.buildUserMessage(input)
    const message = await this.callApi(systemPrompt, userMessage)
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
   * Builds the client-specific user message.
   * Each subclass defines its own structure.
   */
  protected abstract buildUserMessage(input: TInput): string

  /**
   * Parses the raw Anthropic API response into the typed output.
   * Each subclass knows its own output format.
   */
  protected abstract parseResponse(message: Message, input: TInput): TOutput

  /**
   * Shared Anthropic API call with system prompt caching.
   * Private — subclasses never call this directly.
   */
  private async callApi(systemPrompt: string, userMessage: string): Promise<Message> {
    return anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    })
  }
}
