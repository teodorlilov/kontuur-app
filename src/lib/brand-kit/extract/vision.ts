import { extractToolInput } from '@/utils/ai'
import { anthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import type { FontCategory } from '@/lib/render/font-library'

export type VisionInput = {
  base64: string
  mediaType: 'image/png' | 'image/jpeg'
  source: 'website' | 'image'
  accentCandidates: string[] // measured accent hexes (website); empty on the image path
}

export type VisionReport = {
  accent: string | null
  mood: string
  photographicSubjects: string[]
  motifs: string[]
  fontCategory: FontCategory
  feedSystem: { slug: string; reason: string }
}

const VISION_SCHEMA = {
  type: 'object' as const,
  properties: {
    accent: { type: 'string', description: 'The single hex colour that is the true brand accent.' },
    mood: { type: 'string', description: 'The visual mood in 3-6 words.' },
    photographicSubjects: { type: 'array', items: { type: 'string' }, description: 'What this brand should photograph.' },
    motifs: { type: 'array', items: { type: 'string' }, description: 'Abstract marks/motifs that fit the brand.' },
    fontCategory: { type: 'string', enum: ['serif', 'slab', 'sans', 'geometric', 'grotesk', 'humanist', 'mono'] },
    feedSystemSlug: { type: 'string', enum: ['editorial', 'bold-blocks', 'quiet-grid'] },
    feedSystemReason: { type: 'string', description: 'One sentence: why this feed system fits.' },
  },
  required: ['accent', 'mood', 'photographicSubjects', 'motifs', 'fontCategory', 'feedSystemSlug', 'feedSystemReason'],
}

function buildPrompt(input: VisionInput): string {
  const candidates = input.accentCandidates.length
    ? `The page measured these candidate accent colours: ${input.accentCandidates.join(', ')}. Pick the one that reads as the true brand accent, or a better hex if none fit.`
    : `Read the dominant accent colour directly as a hex value.`
  const scope =
    input.source === 'website'
      ? `This is a full-page screenshot. Judge the brand from the LOGO and the colour that recurs across buttons, links, headings and section accents — NOT the hero/banner photo (often a stock image whose colours are not the brand's).`
      : ''
  return `You are judging the visual identity in this ${input.source === 'website' ? 'website screenshot' : 'reference image'}.
${scope}
${candidates}

Then describe: the mood; the photographic subjects this brand should shoot; abstract motifs that fit; the display-type category; and recommend ONE feed system with a one-sentence reason:
- "editorial": high-contrast serif, wide margins, restrained, photography every third post.
- "bold-blocks": heavy uppercase grotesk, solid colour blocks, cover photo only.
- "quiet-grid": light grotesk, generous whitespace, no photography — right for clinics/law/finance.`
}

/** Qualitative vision pass (§2.1/§2.2): re-picks the true accent and infers mood, subjects, motifs, a
 *  font category, and a feed-system recommendation. Everything it returns is badged `inferred`. */
export async function visionRefine(input: VisionInput): Promise<VisionReport> {
  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    tools: [{ name: 'brand_vision', description: 'Return the visual judgement.', input_schema: VISION_SCHEMA }],
    tool_choice: { type: 'tool', name: 'brand_vision' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.base64 } },
          { type: 'text', text: buildPrompt(input) },
        ],
      },
    ],
  })

  const raw = extractToolInput<{
    accent?: unknown
    mood?: unknown
    photographicSubjects?: unknown
    motifs?: unknown
    fontCategory?: unknown
    feedSystemSlug?: unknown
    feedSystemReason?: unknown
  }>(message, VISION_SCHEMA)

  const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const categories: FontCategory[] = ['serif', 'slab', 'sans', 'geometric', 'grotesk', 'humanist', 'mono']

  return {
    accent: typeof raw.accent === 'string' ? raw.accent : null,
    mood: typeof raw.mood === 'string' ? raw.mood : '',
    photographicSubjects: asStrings(raw.photographicSubjects),
    motifs: asStrings(raw.motifs),
    fontCategory: categories.find((c) => c === raw.fontCategory) ?? 'sans',
    feedSystem: {
      slug: typeof raw.feedSystemSlug === 'string' ? raw.feedSystemSlug : 'editorial',
      reason: typeof raw.feedSystemReason === 'string' ? raw.feedSystemReason : '',
    },
  }
}
