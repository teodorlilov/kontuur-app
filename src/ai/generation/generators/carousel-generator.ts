import type { Message } from '@anthropic-ai/sdk/resources'
import { parseJsonResponse } from '@/utils/ai'
import { ContentGenerator } from './content-generator'
import type { CarouselInput, CarouselResult } from '../types'

export class CarouselGenerator extends ContentGenerator<CarouselInput, CarouselResult> {

  protected getPlatform(): string {
    return 'Instagram'
  }

  protected getContentLabel(): string {
    return 'main caption'
  }

  protected buildDirective(input: CarouselInput): string {
    const swipeCues = input.client.languageConfig.carouselSwipeCues

    return `CAROUSEL-SPECIFIC RULES:
SLIDE STRUCTURE:
- Slide 1 (Cover): Bold hook headline only. Opens a loop the reader must swipe to resolve. No body text.
- Slides 2 to ${input.slideCount - 2}: One distinct idea per slide. Headline + 2-3 sentence body. Self-contained.
- Slide ${input.slideCount - 1}: Value/payoff slide. Emotional or informational peak.
- Slide ${input.slideCount} (Last): CTA only. Low-pressure. Include button text suggestion.

SLIDE HEADLINE RULES:
Every headline must name the specific mechanism, condition, technology, or result.
NEVER use topic labels or empty positives.

SLIDE BODY RULES:
Body text must add NEW information beyond the headline. Never explain the headline — extend it.
Minimum 2 sentences per content slide.
Each slide covers a DISTINCT idea — check all prior slides before writing the next.

MAIN CAPTION: 40–60 words. One sharp hook sentence + one bridging sentence + hashtags. Tease the core insight without revealing all slides.

Theme: ${input.theme}
You MUST return exactly ${input.slideCount} slides in the JSON array.

FOR EACH SLIDE: provide a design note (1-2 sentences) for Canva. For the cover slide, suggest a swipe cue overlay text from: ${swipeCues}

Return JSON only:
{
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

  protected parseResponse(message: Message): CarouselResult {
    return parseJsonResponse<CarouselResult>(message)
  }
}
