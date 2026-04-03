import type { Message } from '@anthropic-ai/sdk/resources'
import { stripPlanningPrefix } from '@/utils/ai'
import { ContentGenerator } from './content-generator'
import type { SinglePostInput } from '../types'

export class PostGenerator extends ContentGenerator<SinglePostInput, string[]> {

  protected buildDirective(input: SinglePostInput): string {
    return `PLANNING STEP — complete before writing:
Review the ALLOWED OPENERS and ALLOWED STRUCTURES above.
For each post, declare your choices on one line: [STRUCTURE: name | OPENER: type]
Then write the post immediately after. Do not write anything before the declaration.

Write ${input.count} post(s) for theme '${input.theme}'.
Each must feel distinct — use different structures and opener types.
Separate multiple posts with ---.`
  }

  protected parseResponse(message: Message): string[] {
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    return text.split('---').map(p => p.trim()).filter(Boolean).map(stripPlanningPrefix)
  }
}
