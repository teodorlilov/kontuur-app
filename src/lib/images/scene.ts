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
