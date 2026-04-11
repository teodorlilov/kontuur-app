import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/utils/ai'
import { ContentGenerator } from './content-generator'
import type { GenerationInput, ReelsResult } from '../types'

export class ReelsGenerator extends ContentGenerator<GenerationInput, ReelsResult> {
  protected getPlatform(): string {
    return 'Instagram'
  }

  protected getContentLabel(): string {
    return 'script'
  }

  protected buildSystemPrompt(input: GenerationInput): string {
    return `Write an Instagram Reels script (15-60 seconds when spoken aloud).

SCRIPT STRUCTURE:
- Hook (0-3 sec): One sentence. Instant curiosity or specific problem. No slow intros.
- Main content (3-45 sec): 3-5 short punchy points as spoken word. One per line.
- CTA (last 5 sec): One low-pressure action.

REGISTER: All sections must maintain ${input.client.languageConfig.formality} register.
A formal hook can still be punchy and specific without being casual.

ALSO PROVIDE on-screen text, visual direction, and estimated speaking time.`
  }

  protected buildDirective(input: GenerationInput): string {
    return `Theme: ${input.theme}

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

  protected parseResponse(message: Message): ReelsResult {
    return parseJsonResponse<ReelsResult>(message)
  }
}
