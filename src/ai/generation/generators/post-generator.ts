import type { Message } from '@anthropic-ai/sdk/resources'
import { stripPlanningPrefix } from '@/utils/ai'
import { ContentGenerator } from './content-generator'
import type { SinglePostInput } from '../types'

export class PostGenerator extends ContentGenerator<SinglePostInput, string[]> {

  protected buildDirective(input: SinglePostInput): string {
    return `Write ${input.count} post(s) for theme '${input.theme}'.
For each post, pick a structure from the POST STRUCTURES above and declare it: [STRUCTURE: name]
Then write the post immediately after.
Each must feel distinct — use different structures and opener styles.
Separate multiple posts with ---.`
  }

  protected parseResponse(message: Message): string[] {
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    return text.split('---').map(p => p.trim()).filter(Boolean).map(stripPlanningPrefix)
  }
}
