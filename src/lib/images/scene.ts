import type { BrandBrief } from '@/lib/brand-kit/extract/report'
import { sanitizePromptField } from '@/ai/utils/sanitize'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'

/**
 * Turn a slide's copy + the brand's photographic subjects into ONE concrete, text-free scene to shoot as
 * that slide's background — so each image relates to its slide's message. A cheap Haiku call; fail-soft
 * (null on error), letting the prompt builder fall back to a deterministic brief subject.
 */

const SYSTEM = `You are an art director choosing the background photo for one social-media slide.
Given the slide's copy and the brand's photographic subjects, describe ONE concrete, literal scene to shoot.
Rules:
- Text-free: no signs, labels, screens, posters, or any written words in the scene.
- One or two sentences — a specific subject, setting, and light. Concrete, not abstract or conceptual.
- Relate to the slide's message, but leave calm, uncluttered negative space for text placed on top later.
- Describe only what is physically in the scene: no colours, camera brands, or art-style words.`

const SCHEMA = {
  type: 'object' as const,
  properties: { scene: { type: 'string' } },
  required: ['scene'],
}

export async function composeScene(params: {
  headline: string
  body: string
  brief: BrandBrief | null
}): Promise<string | null> {
  const subjects = (params.brief?.photographicSubjects ?? []).map((s) => sanitizePromptField(s))
  const userMessage = `Slide headline: ${sanitizePromptField(params.headline)}
Slide body: ${sanitizePromptField(params.body)}
Brand photographic subjects: ${subjects.join(', ') || 'none provided'}

Describe the scene.`

  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      systemPrompt: SYSTEM,
      userMessage,
      maxTokens: 200,
      outputSchema: SCHEMA,
    })
    const { scene } = extractToolInput<{ scene?: string }>(message, SCHEMA)
    return typeof scene === 'string' && scene.trim() ? scene.trim() : null
  } catch (err) {
    console.error('[images/scene] composeScene failed:', err)
    return null
  }
}

// ── Carousel-aware scene planning ─────────────────────────────────────────────
// Planning all slides in one call lets the scenes share a through-line — cover establishes the subject, inner
// slides continue it, the CTA closes it — so a carousel reads as ONE story rather than N unrelated pictures.

const CAROUSEL_SYSTEM = `You are an art director planning the background visuals for one social-media carousel.
Given every slide's copy in order and the brand's photographic subjects, describe ONE concrete, literal, text-free scene to shoot for EACH slide.
Rules:
- Plan the set as a coherent story: the first slide establishes the subject/setting; the middle slides continue it (same world, subject or motif, progressing); the last slide closes it. They must clearly belong together.
- Each scene relates to that slide's own message, but leaves calm, uncluttered negative space for text placed on top later.
- Text-free: no signs, labels, screens, posters, or written words in any scene.
- One or two sentences each — a specific subject, setting, and light. Concrete, not abstract. Physical only: no colours, camera brands, or art-style words.
- Return exactly one scene per slide, in order.`

const CAROUSEL_SCHEMA = {
  type: 'object' as const,
  properties: { scenes: { type: 'array', items: { type: 'string' } } },
  required: ['scenes'],
}

/**
 * Plan one text-free scene per slide in a single call so the carousel tells one story (see `CAROUSEL_SYSTEM`).
 * Returns an array aligned to `slides` (each entry is the scene, or `null` where the model gave nothing).
 * Fail-soft: on any error returns all-null, and each caller falls back to a per-slide/brief scene — so the
 * pipeline never blocks on scene planning.
 */
export async function composeCarouselScenes(params: {
  slides: Array<{ headline: string; body: string }>
  brief: BrandBrief | null
}): Promise<Array<string | null>> {
  const nulls = params.slides.map(() => null as string | null)
  if (params.slides.length === 0) return nulls
  const subjects = (params.brief?.photographicSubjects ?? []).map((s) => sanitizePromptField(s))
  const copy = params.slides
    .map((s, i) => `Slide ${i + 1}\nHeadline: ${sanitizePromptField(s.headline)}\nBody: ${sanitizePromptField(s.body)}`)
    .join('\n\n')
  const userMessage = `Brand photographic subjects: ${subjects.join(', ') || 'none provided'}

${copy}

Describe one scene per slide, in order.`

  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      systemPrompt: CAROUSEL_SYSTEM,
      userMessage,
      maxTokens: 140 * params.slides.length + 200,
      outputSchema: CAROUSEL_SCHEMA,
    })
    const { scenes } = extractToolInput<{ scenes?: unknown }>(message, CAROUSEL_SCHEMA)
    if (!Array.isArray(scenes)) return nulls
    return params.slides.map((_, i) => {
      const scene = scenes[i]
      return typeof scene === 'string' && scene.trim() ? scene.trim() : null
    })
  } catch (err) {
    console.error('[images/scene] composeCarouselScenes failed:', err)
    return nulls
  }
}
