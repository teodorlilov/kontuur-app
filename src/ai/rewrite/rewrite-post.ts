import { rewriteCaption, rewriteCarousel } from '@/ai/rewrite/prompts/rewrite-prompts'
import { validatePost } from '@/ai/validation/validate-post'
import { applyPostCorrections, applySlideCorrections } from '@/ai/validation/correction-utils'
import type { RewriteContext } from './types'
import type { SlideText } from '@/types/slide'

/**
 * Rewrite one post's copy against its validation evidence, re-judge it, and return the corrected
 * draft with its fresh verdict — the work src/app/api/ai/rewrite/route.ts meters as one rewrite.
 *
 * A carousel's rewritten headlines and bodies are merged onto its original slides, so every other
 * slide field survives; a carousel with no slides throws before any model call. A single post
 * hands its `slidesJson` back untouched. The verdict goes through `applyPostCorrections`, as
 * generation's does (src/ai/generation/generation-orchestrator.ts), so review never shows fixes
 * beside a pre-fix score.
 */
export async function performRewrite(ctx: RewriteContext) {
  let newCaption: string
  let carouselSlides: SlideText[] | null = null

  if (ctx.postType === 'carousel' && Array.isArray(ctx.slidesJson)) {
    const result = await rewriteCarousel({
      mainCaption: ctx.caption,
      slides: ctx.slidesJson,
      aiTells: ctx.aiTells,
      qualityIssues: ctx.qualityIssues,
      client: ctx.client,
    })
    newCaption = result.main_caption
    carouselSlides = applySlideCorrections(ctx.slidesJson, result.slides)
  } else if (ctx.postType === 'carousel') {
    throw new Error('Cannot rewrite carousel: slides_json is missing or invalid')
  } else {
    newCaption = await rewriteCaption({
      caption: ctx.caption,
      aiTells: ctx.aiTells,
      qualityIssues: ctx.qualityIssues,
      client: ctx.client,
    })
  }

  const validation = await validatePost({
    caption: newCaption,
    slides: carouselSlides ?? undefined,
    client: ctx.client,
    label: `rewrite-${ctx.postType}`,
    sourceContext: ctx.sourceExcerpt
      ? { excerpt: ctx.sourceExcerpt, url: ctx.sourceUrl }
      : undefined,
  })

  const applied = applyPostCorrections(newCaption, carouselSlides, validation)

  return {
    caption: applied.caption,
    slides_json: carouselSlides ? applied.slides : (ctx.slidesJson ?? null),
    quality_score_avg: applied.validation.qualityScore,
    language: applied.validation.language,
    slop: applied.validation.slop,
    sourceGrounding: applied.validation.sourceGrounding ?? null,
    criteria: applied.validation.criteria,
    scores: applied.validation.scores,
  }
}
