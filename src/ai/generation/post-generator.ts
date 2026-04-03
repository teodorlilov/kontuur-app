import type { Message } from '@anthropic-ai/sdk/resources'
import { stripPlanningPrefix } from '@/ai/utils'
import { buildSourceGroundingSection } from '@/ai/generation/prompts/source-grounding'
import {
  buildClientProfile,
  buildAngleDifferentiationSection,
} from '@/ai/generation/prompts/prompt-sections'
import { PROMPT_HISTORY_LIMIT } from '@/utils/constants'
import { ContentGenerator } from './base-generator'
import type { GeneratePostInput } from './types'

export class PostGenerator extends ContentGenerator<GeneratePostInput, string[]> {
  protected buildUserMessage(input: GeneratePostInput): string {
    const sourceSection = buildSourceGroundingSection({
      sourceExcerpt: input.sourceExcerpt,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
    })

    return `${buildClientProfile({
      client: input.client,
      platform: input.platform,
      targetPillar: input.targetPillar,
    })}

Recent topics already covered — do not repeat: ${input.client.postHistory.slice(0, PROMPT_HISTORY_LIMIT).join(' | ')}
${sourceSection}
${buildAngleDifferentiationSection(input.similarPastThemes ?? [])}
Today's date: ${new Date().toISOString().split('T')[0]}

PLANNING STEP — complete before writing:
Review the ALLOWED OPENERS and ALLOWED STRUCTURES above.
For each post, declare your choices on one line: [STRUCTURE: name | OPENER: type]
Then write the post immediately after. Do not write anything before the declaration.

Write ${input.count} post(s) for theme '${input.theme}'.
Each must feel distinct — use different structures and opener types.
Separate multiple posts with ---.`
  }

  protected parseResponse(message: Message, _input: GeneratePostInput): string[] {
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    return text
      .split('---')
      .map(p => p.trim())
      .filter(Boolean)
      .map(stripPlanningPrefix)
  }
}
