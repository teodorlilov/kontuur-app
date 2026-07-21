import { extractToolInput } from '@/utils/ai'
import { anthropic, DEFAULT_MODEL } from '@/utils/ai-client'
import { VIBE_PRESET_IDS, toVibePresetId } from '@/lib/visual/vibe-presets'
import type { VibePresetId } from '@/types/visual'

export type VisionInput = {
  base64: string
  mediaType: 'image/png' | 'image/jpeg'
  accentCandidates: string[] // measured accent hexes
}

export type VisionReport = {
  accent: string | null
  vibePreset: VibePresetId
  presetReason: string
}

const VISION_SCHEMA = {
  type: 'object' as const,
  properties: {
    accent: { type: 'string', description: 'The single hex colour that is the true brand accent.' },
    vibePreset: { type: 'string', enum: VIBE_PRESET_IDS, description: 'The best-fit vibe preset for this brand.' },
    presetReason: { type: 'string', description: 'One sentence: why this vibe preset fits.' },
  },
  required: ['accent', 'vibePreset', 'presetReason'],
}

function buildPrompt(candidates: string[]): string {
  const accentLine = candidates.length
    ? `The page measured these candidate accent colours: ${candidates.join(', ')}. Pick the one that reads as the true brand accent, or a better hex if none fit.`
    : `Read the dominant accent colour directly as a hex value.`
  return `You are judging the visual identity in this full-page website screenshot.
Judge the brand from the LOGO and the colour that recurs across buttons, links, headings and section accents — NOT the hero/banner photo (often a stock image whose colours are not the brand's).
${accentLine}

Then recommend ONE vibe preset with a one-sentence reason:
- "luxury-minimalist": soft lighting, neutral/beige palettes, editorial negative space — clinics, skincare, premium real estate, high-end coaching.
- "modern-tech": 3D isometric shapes, flat vibrant vectors, geometric — SaaS, marketing/finance/crypto, B2B.
- "creative-edgy": risograph texture, halftone, neon, bold retro-modern — freelancers, Gen-Z, streetwear, media.
- "polished-photo": realistic lifestyle photography, natural sunlight, product close-ups — e-commerce, lifestyle, restaurants, fitness.`
}

/**
 * Qualitative vision pass: re-picks the true accent and infers the best-fit vibe preset from a full-page
 * screenshot. Everything it returns is badged `inferred`. Reuses the shared Anthropic client.
 */
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
          { type: 'text', text: buildPrompt(input.accentCandidates) },
        ],
      },
    ],
  })

  const raw = extractToolInput<{
    accent?: unknown
    vibePreset?: unknown
    presetReason?: unknown
  }>(message, VISION_SCHEMA)

  return {
    accent: typeof raw.accent === 'string' ? raw.accent : null,
    vibePreset: toVibePresetId(typeof raw.vibePreset === 'string' ? raw.vibePreset : null),
    presetReason: typeof raw.presetReason === 'string' ? raw.presetReason : '',
  }
}
