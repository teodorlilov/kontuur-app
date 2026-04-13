import { callAnthropic } from '@/utils/ai-client'
import { parseJsonResponse } from '@/utils/ai'
import { buildClientSection, buildAngleVariationPrompt } from '@/ai/shared/build-client-profile'
import { buildGroundingPrompt } from '@/ai/generation/prompts/source-grounding'
import { sanitizePromptField, DEFENSIVE_DATA_CLAUSE } from '@/ai/utils/sanitize'
import { todayDateString, formatHistory } from '@/ai/utils/prompt-helpers'
import type { GenerationInput, ReelsResult } from '../types'

export async function generateReels(
  input: GenerationInput,
  onToken?: (text: string) => void
): Promise<ReelsResult> {
  const historyText = formatHistory(input.client.postHistory)
  const formality = input.client.languageConfig.formality

  const systemPrompt = `Write an Instagram Reels script (15-60 seconds when spoken aloud). ${DEFENSIVE_DATA_CLAUSE}

SCRIPT STRUCTURE:
- Hook (0-3 sec): One sentence. Instant curiosity or specific problem. No slow intros.
- Main content (3-45 sec): 3-5 short punchy points as spoken word. One per line.
- CTA (last 5 sec): One low-pressure action.

REGISTER: All sections must maintain ${formality} register.
A formal hook can still be punchy and specific without being casual.

ALSO PROVIDE on-screen text, visual direction, and estimated speaking time.`

  const userMessage = [
    buildClientSection(input.client, 'Instagram', input.targetPillar),
    buildGroundingPrompt({
      sourceExcerpt: input.sourceExcerpt,
      sourceFullText: input.sourceFullText,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
      contentLabel: 'script',
    }),
    input.brief
      ? [
          'PRIORITY POST BRIEF (follow exactly — this overrides creative latitude):',
          sanitizePromptField(input.brief),
          ...(input.targetDate ? [`Target publish date: ${input.targetDate}`] : []),
        ].join('\n')
      : '',
    historyText ? `Recent topics already covered — do not repeat: ${historyText}` : '',
    buildAngleVariationPrompt(input.similarPastThemes ?? []),
    `Today's date: ${todayDateString()}`,
    `Theme: ${sanitizePromptField(input.theme)}

Return JSON only:
{
  "hook": string,
  "main_points": string[],
  "cta": string,
  "on_screen_text": string[],
  "visual_directions": string[],
  "estimated_seconds": number
}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const message = await callAnthropic({ systemPrompt, userMessage, onToken })
  return parseJsonResponse<ReelsResult>(message)
}
