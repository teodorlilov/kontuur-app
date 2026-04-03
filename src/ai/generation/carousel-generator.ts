import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/utils/ai'
import { buildSourceGroundingSection } from '@/ai/generation/prompts/source-grounding'
import {
  buildClientProfile,
  buildAngleDifferentiationSection,
} from '@/ai/generation/prompts/prompt-sections'
import { PROMPT_HISTORY_LIMIT } from '@/utils/constants'
import { ContentGenerator } from './base-generator'
import type { GenerateCarouselInput, CarouselResult } from './types'

export class CarouselGenerator extends ContentGenerator<GenerateCarouselInput, CarouselResult> {
  protected buildUserMessage(input: GenerateCarouselInput): string {
    const sourceSection = buildSourceGroundingSection({
      sourceExcerpt: input.sourceExcerpt,
      sourceUrl: input.sourceUrl,
      requireSourceGrounding: input.requireSourceGrounding,
      contentLabel: 'main caption',
    })

    const carouselRules = this.buildCarouselRules(input)

    return `${buildClientProfile({
      client: input.client,
      platform: 'Instagram',
      targetPillar: input.targetPillar,
    })}

${carouselRules}

Recent topics already covered — do not repeat: ${input.client.postHistory.slice(0, PROMPT_HISTORY_LIMIT).join(' | ')}
${sourceSection}
${buildAngleDifferentiationSection(input.similarPastThemes ?? [])}
Today's date: ${new Date().toISOString().split('T')[0]}

Theme: ${input.theme}
You MUST return exactly ${input.slideCount} slides in the JSON array.

First choose your structure and opener for the main caption, then write.
FOR EACH SLIDE: provide a design note (1-2 sentences) for Canva.

Return JSON only:
{
  "chosen_structure": string,
  "chosen_opener": string,
  "main_caption": string,
  "slides": [{
    "slide_number": number,
    "slide_role": "cover" | "content" | "value" | "cta",
    "headline": string,
    "body": string,
    "cta_text": string | null,
    "design_note": string
  }]
}`
  }

  protected parseResponse(message: Message, _input: GenerateCarouselInput): CarouselResult {
    return parseJsonResponse<CarouselResult>(message)
  }

  /**
   * Carousel-specific slide rules.
   * Private — only used when building the carousel user message.
   */
  private buildCarouselRules(input: GenerateCarouselInput): string {
    const swipeCues = input.client.languageConfig.carouselSwipeCues

    return `CAROUSEL-SPECIFIC RULES:
SLIDE STRUCTURE:
- Slide 1 (Cover): Bold hook headline only. Opens a loop the reader must swipe to resolve. Add approved swipe cue. No body text.
- Slides 2 to ${input.slideCount - 2}: One distinct idea per slide. Headline + 2-3 sentence body. Self-contained.
- Slide ${input.slideCount - 1}: Value/payoff slide. Emotional or informational peak.
- Slide ${input.slideCount} (Last): CTA only. Low-pressure. Include button text suggestion.

SLIDE HEADLINE RULES:
Every headline must contain a specific number, named tension, or counterintuitive claim.
NEVER use topic labels or generic positives.
WRONG: "Hydration" | RIGHT: "Your skin retains 40% less water after winter"

SLIDE BODY RULES:
Body text must add NEW information beyond the headline. Never explain the headline — extend it.
Minimum 2 sentences per content slide.
Each slide covers a DISTINCT idea — check all prior slides before writing the next.

SWIPE CUES — use ONLY these approved phrases, never invent new ones:
${swipeCues}

REGISTER PER SLIDE:
Apply the same register rules to every slide individually.
Anglicism and calques apply per - slide - check each slide separately



MAIN CAPTION: max 3 lines, teases carousel, ends with an approved swipe cue, 1-3 niche hashtags at end.`
  }
}
