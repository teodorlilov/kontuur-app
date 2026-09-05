import { rewriteCaption, rewriteCarousel } from '@/ai/rewrite/prompts/rewrite-prompts'
import { validatePost } from '@/ai/validation/validate-post'
import { applyPostCorrections, applySlideCorrections } from '@/ai/validation/correction-utils'
import type { RewriteContext } from './types'
import type { SlideText } from '@/types/slide'

export type { RewriteContext }

export async function performRewrite(ctx: RewriteContext) {
  let newCaption: string
  let newSlidesJson: unknown = ctx.slidesJson ?? null

  // Rewrite via Anthropic API
  if (ctx.postType === 'carousel' && Array.isArray(ctx.slidesJson)) {
    const result = await rewriteCarousel({
      mainCaption: ctx.caption,
      slides: ctx.slidesJson,
      aiTells: ctx.aiTells,
      qualityIssues: ctx.qualityIssues,
      client: ctx.client,
    })
    newCaption = result.main_caption
    // Merge rewritten headline/body onto originals to preserve slide_number, slide_role, etc.
    newSlidesJson = applySlideCorrections(ctx.slidesJson, result.slides)
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

  const isCarousel = ctx.postType === 'carousel' && Array.isArray(newSlidesJson)

  const validation = await validatePost({
    caption: newCaption,
    slides: isCarousel ? (newSlidesJson as SlideText[]) : undefined,
    client: ctx.client,
    label: `rewrite-${ctx.postType}`,
    sourceContext: ctx.sourceExcerpt
      ? { excerpt: ctx.sourceExcerpt, url: ctx.sourceUrl }
      : undefined,
  })

  // Same contract as generation: the returned verdict is re-scored against the
  // corrected copy, so the review panel never shows fixes beside a pre-fix score.
  const applied = applyPostCorrections(
    newCaption,
    isCarousel ? (newSlidesJson as SlideText[]) : null,
    validation
  )

  return {
    caption: applied.caption,
    slides_json: isCarousel ? applied.slides : newSlidesJson,
    quality_score_avg: applied.validation.qualityScore,
    language: applied.validation.language,
    slop: applied.validation.slop,
    sourceGrounding: applied.validation.sourceGrounding ?? null,
    criteria: applied.validation.criteria,
    scores: applied.validation.scores,
  }
}
