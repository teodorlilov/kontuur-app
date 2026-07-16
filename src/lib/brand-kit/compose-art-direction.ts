import { sanitizePromptField } from '@/ai/utils/sanitize'
import { callAnthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import { clampArtDirection, DEFAULT_ART_DIRECTION, type ArtDirection } from './art-direction'

/**
 * The **AI art director**. Given a brand's visual identity (from the site) + its business context (the
 * onboarding interview) + any references it admires, compose a distinctive, niche-appropriate art-direction
 * spec — the coherent design direction every later post is generated through. A senior-designer system
 * prompt steers it away from generic/templated defaults. Fail-soft: any error → `DEFAULT_ART_DIRECTION`.
 * Runs once per brand at review (and on "Recompose"), not per post.
 */

export type ArtDirectionInput = {
  // Visual identity (from extraction / vision)
  mood: string
  motifs: string[]
  photographicSubjects: string[]
  palette: string[]
  fontCategory: string
  // Business context (from the onboarding interview / brand profile)
  niche: string
  audience: string
  goal: string
  tone: string
  formalityNote: string
  pillars: string[]
  references: string
}

const SYSTEM = `You are a senior brand designer composing the ART DIRECTION for a client's social-media design system — the single coherent direction every future post is generated through.

Compose a DISTINCTIVE, niche-appropriate direction — never a generic or templated safe default. Match the business to how its world actually looks: a medical clinic reads clean, precise, trustworthy; a creative studio reads expressive and image-forward; a law firm reads restrained and formal; a bakery reads warm. Let the business drive correctness and the visual identity + references drive distinctiveness.

For each quality choose exactly one of the given enum values. Write:
- "personality": 3–6 words capturing the brand's character.
- "ornamentBrief": a short description of the brand-specific marks / patterns / textures a vector generator should produce for this brand (derived from its motifs), OR an empty string if the brand should carry no ornament. Describe the ornament's CHARACTER, never a specific gimmick or technique (no "torn paper", no named effects).`

const SCHEMA = {
  type: 'object' as const,
  properties: {
    personality: { type: 'string', description: '3-6 words: the brand character.' },
    formality: { type: 'string', enum: ['clinical', 'corporate', 'editorial', 'expressive'] },
    imagery: { type: 'string', enum: ['photographic', 'vector', 'illustrative', 'mixed', 'minimal'] },
    density: { type: 'string', enum: ['airy', 'balanced', 'dense'] },
    typeCase: { type: 'string', enum: ['mixed', 'upper'] },
    paletteDiscipline: { type: 'string', enum: ['mono-accent', 'multi'] },
    treatment: { type: 'string', enum: ['none', 'duotone', 'tint', 'grain', 'mono', 'halftone'] },
    ornamentBrief: { type: 'string', description: 'Brand-specific ornament to generate, or empty. Character only, no named gimmicks.' },
  },
  required: ['personality', 'formality', 'imagery', 'density', 'typeCase', 'paletteDiscipline', 'treatment', 'ornamentBrief'],
}

export async function composeArtDirection(input: ArtDirectionInput): Promise<ArtDirection> {
  const s = sanitizePromptField
  const list = (xs: string[]) => xs.map((x) => s(x)).filter(Boolean).join(', ') || 'none'
  const userMessage = `BUSINESS
- What they do / niche: ${s(input.niche) || 'unknown'}
- Audience: ${s(input.audience) || 'unknown'}
- Goal of a post: ${s(input.goal) || 'unknown'}
- Tone / personality: ${s(input.tone) || 'unknown'}
- Formality: ${s(input.formalityNote) || 'unknown'}
- Content pillars: ${list(input.pillars)}
- References they admire: ${s(input.references) || 'none given'}

VISUAL IDENTITY (from their site)
- Mood: ${s(input.mood) || 'unknown'}
- Photographic subjects: ${list(input.photographicSubjects)}
- Motifs: ${list(input.motifs)}
- Palette: ${list(input.palette)}
- Display type category: ${s(input.fontCategory) || 'unknown'}

Compose the art direction.`

  try {
    const message = await callAnthropic({ model: DEFAULT_MODEL, systemPrompt: SYSTEM, userMessage, maxTokens: 400, outputSchema: SCHEMA })
    return clampArtDirection(extractToolInput<Record<string, unknown>>(message, SCHEMA))
  } catch (err) {
    console.error('[brand-kit/compose-art-direction] failed:', err)
    return DEFAULT_ART_DIRECTION
  }
}
