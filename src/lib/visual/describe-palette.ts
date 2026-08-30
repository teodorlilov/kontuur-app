import type { ColorRole, Palette } from '@/types/visual'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'

/** Role → label used in the COLOR PALETTE block; shared by the Haiku path and the hex fallback. */
const ROLE_LABELS: Record<ColorRole, string> = {
  surface: 'Dominant background',
  ink: 'Ink',
  accent: 'Primary accent',
  'accent-deep': 'Deep accent',
  line: 'Neutral line',
}

const ROLE_ORDER: ColorRole[] = ['surface', 'ink', 'accent', 'accent-deep', 'line']

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    surface: { type: 'string', description: 'Human colour name for the dominant background' },
    ink: { type: 'string', description: 'Human colour name for the text/ink colour' },
    accent: { type: 'string', description: 'Human colour name for the primary accent' },
    accent_deep: { type: 'string', description: 'Human colour name for the deep accent' },
    line: { type: 'string', description: 'Human colour name for the neutral line/border colour' },
    character: {
      type: 'string',
      description: 'One sentence describing the overall palette character',
    },
  },
  required: ['surface', 'ink', 'accent', 'accent_deep', 'line', 'character'],
}

type ColorNaming = {
  surface: string
  ink: string
  accent: string
  accent_deep: string
  line: string
  character: string
}

function assembleBlock(names: Record<ColorRole, string>, character?: string): string {
  const lines = ROLE_ORDER.map((role) => `${ROLE_LABELS[role]}: ${names[role]}`)
  if (character) lines.push(`Palette character: ${character}`)
  return lines.join('\n')
}

/** Raw `label: hex` block — image models read hex fine, so this is the no-AI safety net. */
function fallbackDescription(palette: Palette): string {
  return assembleBlock(palette)
}

/**
 * Turn a hex palette into the human-readable COLOR PALETTE block injected into image prompts
 * (e.g. "Dominant background: white … Palette character: cool, clean, modern"). Never throws:
 * falls back to raw `label: hex` lines if the Haiku call fails.
 *
 * It once also named a stored list of campaign grounds and cached the answers index-aligned beside
 * them. Colours are derived per post now, so there is no list to name and nothing to keep in sync —
 * `nameColor` does it locally and for free.
 */
export async function describePalette(palette: Palette): Promise<string> {
  const paletteLines = ROLE_ORDER.map((role) => `${ROLE_LABELS[role]}: ${palette[role]}`)
  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      maxTokens: 300,
      // Naming a hex has one right answer, and this call races itself: the visuals cron runs two
      // lanes, so two slides of one carousel can both find the description missing and both write
      // one. At default sampling they disagree — "warm sand" on slide 1, "muted gold" on slide 2,
      // last write wins — and the same carousel goes to gpt-image-2 in two different vocabularies.
      // At 0 the lanes converge on identical text, so the race stops mattering.
      temperature: 0,
      systemPrompt:
        'You name brand colours for image-generation prompts. For each hex colour, return a short, precise human-readable colour name (e.g. "medium periwinkle blue", "warm off-white"). Also return one sentence capturing the overall palette character (temperature, mood, harmony).',
      userMessage: paletteLines.join('\n'),
      outputSchema: OUTPUT_SCHEMA,
    })
    const parsed = extractToolInput<ColorNaming>(message, OUTPUT_SCHEMA)
    return assembleBlock(
      {
        surface: parsed.surface,
        ink: parsed.ink,
        accent: parsed.accent,
        'accent-deep': parsed.accent_deep,
        line: parsed.line,
      },
      parsed.character
    )
  } catch (err) {
    console.warn('[describe-palette] Haiku call failed, using hex fallback', err)
    return fallbackDescription(palette)
  }
}
