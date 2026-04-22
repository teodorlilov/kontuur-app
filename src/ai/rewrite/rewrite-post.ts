import { rewriteCaption, rewriteCarousel } from '@/ai/rewrite/prompts/rewrite-prompts'
import { validatePost } from '@/ai/validation/validate-post'
import { applyTextCorrections, applySlideCorrections } from '@/ai/validation/correction-utils'
import type { RewriteContext } from './types'

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
      platform: ctx.platform,
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
      platform: ctx.platform,
    })
  }

  const isCarousel = ctx.postType === 'carousel' && Array.isArray(newSlidesJson)

  const validation = await validatePost({
    caption: newCaption,
    slides: isCarousel ? (newSlidesJson as Array<{ headline: string; body: string }>) : undefined,
    client: ctx.client,
    label: `rewrite-${ctx.postType}`,
    platform: ctx.platform,
    sourceContext: ctx.sourceExcerpt
      ? { excerpt: ctx.sourceExcerpt, url: ctx.sourceUrl }
      : undefined,
  })

  const finalCaption = applyTextCorrections(newCaption, validation)
  const finalSlidesJson = isCarousel
    ? applySlideCorrections(
        newSlidesJson as Array<{ headline: string; body: string }>,
        validation.language.corrected_slides
      )
    : newSlidesJson

  return {
    caption: finalCaption,
    slides_json: finalSlidesJson,
    quality_score_avg: validation.qualityScore,
    language: validation.language,
    slop: validation.slop,
    sourceGrounding: validation.sourceGrounding ?? null,
    criteria: validation.criteria,
    scores: validation.scores,
  }
}
