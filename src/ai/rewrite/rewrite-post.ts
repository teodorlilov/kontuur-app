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
    newSlidesJson = result.slides
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
    languageConfig: ctx.client.languageConfig,
    label: `rewrite-${ctx.postType}`,
    platform: ctx.platform,
    sourceContext: ctx.sourceExcerpt
      ? { excerpt: ctx.sourceExcerpt, url: ctx.sourceUrl }
      : undefined,
    qualityContext: {
      tone: ctx.client.tone || undefined,
      targetAudience: ctx.client.targetAudience || undefined,
      niche: ctx.client.niche || undefined,
      clientTestimonialVoice: ctx.client.clientTestimonialVoice || undefined,
      isHealthClient: ctx.client.isHealthNiche ?? undefined,
    },
  })

  const finalCaption = applyTextCorrections(newCaption, validation)
  const finalSlidesJson = isCarousel
    ? applySlideCorrections(
        newSlidesJson as Array<{ headline: string; body: string }>,
        validation.language.corrected_slides
      )
    : newSlidesJson

  // If language corrections were auto-applied, update the score to reflect corrected text
  const langCorrected = !!(
    validation.language.corrected_text || validation.language.corrected_slides
  )
  const language = langCorrected
    ? { ...validation.language, language_score: 10, passes: true }
    : validation.language

  return {
    caption: finalCaption,
    slides_json: finalSlidesJson,
    quality_score_avg: validation.qualityScore,
    quality: validation.quality,
    language,
    slop: validation.slop,
    sourceGrounding: validation.sourceGrounding ?? null,
  }
}
