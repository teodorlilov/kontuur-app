import type { BrandBrief } from '@/types/visual'
import { sanitizePromptField } from '@/ai/utils/sanitize'
import { callAnthropic, LIGHT_MODEL } from '@/utils/ai-client'
import { extractToolInput } from '@/utils/ai'
import type { VisualUnit } from './types'

/**
 * Plan the background imagery for a post's anchor units (cover/CTA) in one cheap Haiku call — grounded in
 * the client (niche + photographic subjects) AND the specific post/slide copy, so each scene is relevant to
 * both and the set reads as one story. Interiors don't need a scene (they use an abstract brand texture).
 */

const SYSTEM = `You are an art director planning the background imagery for a brand's social-media post.
Given the brand (its niche + what it photographs), the post's topic, and each slide's copy, describe ONE concrete, literal, TEXT-FREE scene to shoot as the background for EACH slide.
Rules:
- Ground every scene in the brand's real world (its niche + photographic subjects) AND that slide's message — relevant to both.
- Plan the set as a coherent story: the cover establishes; the closing/CTA slide resolves. They belong together.
- Text-free: no signs, labels, screens, posters, or written words in any scene.
- One or two sentences each — a specific subject, setting, and light. Concrete and physical only: no colours, camera brands, or art-style words.
- Leave calm, uncluttered negative space for text placed on top later.
- Return exactly one scene per slide, in the given order.`

const SCHEMA = {
  type: 'object' as const,
  properties: { scenes: { type: 'array', items: { type: 'string' } } },
  required: ['scenes'],
}

export type SceneContext = { clientName: string; clientNiche: string; topic: string; brief: BrandBrief | null }

/** Plan one text-free scene per unit, aligned to `units` (null where the model gave nothing). Fail-soft. */
export async function planScenes(units: VisualUnit[], ctx: SceneContext): Promise<Array<string | null>> {
  const nulls = units.map(() => null as string | null)
  if (units.length === 0) return nulls
  const subjects = (ctx.brief?.photographicSubjects ?? []).map((s) => sanitizePromptField(s))
  const copy = units
    .map(
      (u, i) =>
        `Slide ${i + 1} (${u.role})\nHeadline: ${sanitizePromptField(u.headline)}\nBody: ${sanitizePromptField(u.body)}`
    )
    .join('\n\n')
  const userMessage = `Brand: ${sanitizePromptField(ctx.clientName)} — ${sanitizePromptField(ctx.clientNiche)}.
Brand photographic subjects: ${subjects.join(', ') || 'none provided'}.
Post topic: ${sanitizePromptField(ctx.topic) || 'general'}.

${copy}

Describe one scene per slide, in order.`

  try {
    const message = await callAnthropic({
      model: LIGHT_MODEL,
      systemPrompt: SYSTEM,
      userMessage,
      maxTokens: 140 * units.length + 200,
      outputSchema: SCHEMA,
    })
    const { scenes } = extractToolInput<{ scenes?: unknown }>(message, SCHEMA)
    if (!Array.isArray(scenes)) return nulls
    return units.map((_, i) => {
      const scene = scenes[i]
      return typeof scene === 'string' && scene.trim() ? scene.trim() : null
    })
  } catch (err) {
    console.error('[images/scene] planScenes failed:', err)
    return nulls
  }
}
