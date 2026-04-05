import type { Message } from '@anthropic-ai/sdk/resources'
import { ContentGenerator } from './content-generator'
import type { SinglePostInput } from '../types'

export interface ParsedPost {
  caption: string
  declaredStructure: string | null
}

/**
 * Extracts the [STRUCTURE: name] declaration from the planning step.
 * Returns the structure name and the clean caption without the declaration line.
 * Handles both [STRUCTURE: X] and [STRUCTURE: X | OPENER: Y] (legacy) formats.
 */
function parsePostDeclaration(text: string): ParsedPost {
  // Match [STRUCTURE: MYTH-BREAKER] or [STRUCTURE: MYTH-BREAKER | OPENER: type] (legacy)
  const match = text.match(/^\[STRUCTURE:\s*([^\]|]+?)(?:\s*[|,][^\]]*)?\]\s*/i)
  if (match?.[1]) {
    return {
      declaredStructure: match[1].trim(),
      caption: text.slice(match[0].length).trim(),
    }
  }

  // Also check if the first line is a standalone [STRUCTURE: X | OPENER: Y] line
  const lines = text.split('\n')
  const firstLine = (lines[0] ?? '').trim()
  if (
    firstLine.startsWith('[') &&
    firstLine.endsWith(']') &&
    firstLine.toUpperCase().includes('STRUCTURE')
  ) {
    const structMatch = firstLine.match(/STRUCTURE:\s*([^\]|,]+)/i)
    return {
      declaredStructure: structMatch?.[1]?.trim() ?? null,
      caption: lines.slice(1).join('\n').trim(),
    }
  }

  return { declaredStructure: null, caption: text.trim() }
}

export class PostGenerator extends ContentGenerator<SinglePostInput, ParsedPost[]> {

  protected buildDirective(input: SinglePostInput): string {
    return `Write ${input.count} post(s) for theme '${input.theme}'.
For each post, pick a structure from the POST STRUCTURES above and declare it: [STRUCTURE: name]
Then write the post immediately after.
Each must feel distinct — use different structures and opener styles.
Separate multiple posts with ---.

NEVER use 'problem → solution → CTA'. The reader must NOT predict the structure after the first line.
Exception: MYTH-BREAKER and CONFESSION structures may omit the CTA entirely.
SELF-CHECK: Can the reader predict the post's structure after the first line? If yes — restructure.`
  }

  protected parseResponse(message: Message): ParsedPost[] {
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    return text
      .split('---')
      .map(p => p.trim())
      .filter(Boolean)
      .map(parsePostDeclaration)
  }
}
