import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/ai/utils'
import { buildSourceGroundingSection } from '@/ai/generation/prompts/source-grounding'
import {
  buildClientProfile,
  buildAngleDifferentiationSection,
} from '@/ai/generation/prompts/prompt-sections'
import { ContentGenerator } from './base-generator'
import type { GenerateReelsInput, ReelsResult } from './types'

export class ReelsGenerator extends ContentGenerator<GenerateReelsInput, ReelsResult> {
  /**
   * Reels needs a script-writing system prompt, not the social post system prompt.
   * Override buildSystemPrompt() while still inheriting callApi() and generate().
   */
  protected buildSystemPrompt(input: GenerateReelsInput): string {
    const formality = input.client.languageConfig.formality
    return `Write an Instagram Reels script (15-60 seconds when spoken aloud).

SCRIPT STRUCTURE:
- Hook (0-3 sec): One sentence. Instant curiosity or specific problem. No slow intros.
- Main content (3-45 sec): 3-5 short punchy points as spoken word. One per line.
- CTA (last 5 sec): One low-pressure action.

REGISTER: The hook, main points, and CTA must all maintain ${formality} register.
A formal hook can still be punchy and specific without being casual.

ALSO PROVIDE:
- On-screen text suggestions per section
- Visual direction per section (simple talking head directions)
- Estimated speaking time in seconds`
  }

  protected buildUserMessage(input: GenerateReelsInput): string {
    const sourceSection = buildSourceGroundingSection({
      sourceExcerpt: input.sourceExcerpt,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
    })

    return `${buildClientProfile({
      client: input.client,
      platform: 'Instagram',
      targetPillar: input.targetPillar,
    })}

${sourceSection}
${buildAngleDifferentiationSection(input.similarPastThemes ?? [])}
Today's date: ${new Date().toISOString().split('T')[0]}

Theme: ${input.theme}

Return JSON only:
{
  "hook": string,
  "main_points": string[],
  "cta": string,
  "on_screen_text": string[],
  "visual_directions": string[],
  "estimated_seconds": number
}`
  }

  protected parseResponse(message: Message, _input: GenerateReelsInput): ReelsResult {
    return parseJsonResponse<ReelsResult>(message)
  }
}
