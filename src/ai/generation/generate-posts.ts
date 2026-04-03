import { randomUUID } from 'crypto'
import { GeneratorFactory } from '@/ai/generation/generator-factory'
import type {
  GeneratePostInput, GenerateCarouselInput, GenerateReelsInput,
  CarouselResult, ReelsResult,
  GeneratedPostEntry, ThemeWithMeta, GeneratePostsContext,
} from '@/ai/generation/types'
import { validatePost } from '@/ai/validation/validate-post'
import type { PostValidationResult } from '@/ai/validation/validate-post'
import { applyTextCorrections, applySlideCorrections } from '@/ai/validation/correction-utils'
import { Deduplicator } from '@/ai/research/deduplicator'
import { ANGLE_SIMILARITY_THRESHOLD } from '@/lib/content-rules/constants'
import { toBrandQualityFields } from '@/lib/clients/fetch-client-data'

const MAX_CONCURRENT_AI_CALLS = 3

export async function generatePosts(ctx: GeneratePostsContext): Promise<GeneratedPostEntry[]> {
  const generatedPosts: GeneratedPostEntry[] = []

  // Build all themes including priority posts
  const allThemes: ThemeWithMeta[] = [
    ...(ctx.priorityPosts ?? []).map((pp) => ({
      description: pp.title,
      count: 1,
      isPriority: true,
      brief: pp.brief,
      targetDate: pp.targetDate,
    })),
    ...(ctx.themes ?? []),
  ]

  // Attach similar past themes for angle differentiation
  for (const theme of allThemes) {
    const similar = ctx.client.postHistory.filter(
      (topic) => Deduplicator.ngramSimilarity(theme.description, topic, ctx.client.languageConfig.language) > ANGLE_SIMILARITY_THRESHOLD
    )
    if (similar.length > 0) {
      theme.similarPastThemes = similar.slice(0, 3)
    }
  }

  const getGroundingText = (theme: ThemeWithMeta) => theme.sourceFullText || theme.sourceExcerpt

  const sharedQualityContext = toBrandQualityFields(ctx.client)

  const generator = GeneratorFactory.create(ctx.postType)

  function isCarouselResult(r: unknown): r is CarouselResult {
    return typeof r === 'object' && r !== null && 'main_caption' in r && 'slides' in r
  }

  function isReelsResult(r: unknown): r is ReelsResult {
    return typeof r === 'object' && r !== null && 'hook' in r && 'main_points' in r
  }

  async function processTheme(theme: ThemeWithMeta): Promise<void> {
    const input = buildGeneratorInput(ctx, theme)
    const result = await generator.generate(input)

    if (ctx.postType === 'carousel' && isCarouselResult(result)) {
      await processCarouselResult(theme, result)
    } else if (ctx.postType === 'reels' && isReelsResult(result)) {
      await processReelsResult(theme, result)
    } else if (Array.isArray(result)) {
      await processSingleResult(theme, result)
    } else {
      console.error(`[generate] unexpected result shape for theme "${theme.description}"`)
    }
  }

  // Process themes in batches of MAX_CONCURRENT_AI_CALLS
  for (let i = 0; i < allThemes.length; i += MAX_CONCURRENT_AI_CALLS) {
    const batch = allThemes.slice(i, i + MAX_CONCURRENT_AI_CALLS)
    const results = await Promise.allSettled(batch.map(theme => processTheme(theme)))

    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(
          `[generate] failed to process theme "${batch[idx]?.description}":`,
          result.reason
        )
      }
    })
  }

  return generatedPosts

  function buildGeneratorInput(
    c: GeneratePostsContext,
    theme: ThemeWithMeta,
  ): GeneratePostInput | GenerateCarouselInput | GenerateReelsInput {
    const groundingText = getGroundingText(theme)
    const base = {
      client: c.client,
      theme: theme.description,
      targetPillar: theme.pillar,
      sourceExcerpt: groundingText,
      sourceUrl: theme.sourceUrl,
      requireSourceGrounding: c.requireSourceGrounding || !!groundingText,
      similarPastThemes: theme.similarPastThemes,
    }

    if (c.postType === 'carousel') {
      return { ...base, slideCount: c.slideCount }
    }
    if (c.postType === 'reels') {
      return { ...base }
    }
    return { ...base, platform: c.platform, count: theme.count || 1 }
  }

  function buildSourceContext(theme: ThemeWithMeta) {
    const groundingText = getGroundingText(theme)
    return ctx.requireSourceGrounding && groundingText
      ? { excerpt: groundingText, url: theme.sourceUrl }
      : undefined
  }

  function buildPostEntry(
    theme: ThemeWithMeta,
    overrides: {
      caption: string
      post_type: 'single' | 'carousel' | 'reels'
      slides_json: unknown
      carousel_quality_json?: unknown
      quality_score_avg: number
    },
  ): Record<string, unknown> {
    return {
      id: randomUUID(),
      client_id: ctx.client.id,
      platform: ctx.platform,
      status: 'draft',
      priority: theme.isPriority ?? false,
      topic_summary: theme.description,
      source_url: theme.sourceUrl ?? null,
      source_title: theme.sourceTitle ?? null,
      source_type: theme.sourceType ?? null,
      source_excerpt: theme.sourceExcerpt ?? null,
      pillar: theme.pillar ?? null,
      carousel_quality_json: null,
      created_at: new Date().toISOString(),
      ...overrides,
    }
  }

  function pushEntry(validation: PostValidationResult, post: Record<string, unknown>) {
    generatedPosts.push({
      post,
      quality: validation.quality,
      language: validation.language,
      slop: validation.slop,
      ...(validation.sourceGrounding ? { sourceGrounding: validation.sourceGrounding } : {}),
    })
  }

  async function processCarouselResult(theme: ThemeWithMeta, carouselResult: CarouselResult) {
    if (carouselResult.slides.length !== ctx.slideCount) {
      console.warn(
        `[generate] carousel for "${theme.description}" returned ` +
        `${carouselResult.slides.length} slides, expected ${ctx.slideCount}`
      )
    }

    const carouselValidation = await validatePost({
      caption: carouselResult.main_caption,
      slides: carouselResult.slides,
      languageConfig: ctx.client.languageConfig,
      label: 'carousel',
      platform: ctx.platform,
      sourceContext: buildSourceContext(theme),
      qualityContext: sharedQualityContext,
    })

    const finalCarouselCaption = applyTextCorrections(carouselResult.main_caption, carouselValidation)
    const finalCarouselSlides = applySlideCorrections(
      carouselResult.slides,
      carouselValidation.language.corrected_slides,
    )

    void ctx.trackTheme(theme, 1)

    pushEntry(carouselValidation, buildPostEntry(theme, {
      caption: finalCarouselCaption,
      post_type: 'carousel',
      slides_json: finalCarouselSlides,
      carousel_quality_json: carouselValidation.quality,
      quality_score_avg: carouselValidation.qualityScore,
    }))
  }

  async function processReelsResult(theme: ThemeWithMeta, reelsResult: ReelsResult) {
    const scriptText = `${reelsResult.hook}\n${reelsResult.main_points.join('\n')}\n${reelsResult.cta}`
    const validation = await validatePost({
      caption: scriptText,
      languageConfig: ctx.client.languageConfig,
      label: 'reels',
      platform: ctx.platform,
      sourceContext: buildSourceContext(theme),
      qualityContext: sharedQualityContext,
    })

    const finalReelsCaption = applyTextCorrections(scriptText, validation)

    void ctx.trackTheme(theme, 1)

    pushEntry(validation, buildPostEntry(theme, {
      caption: finalReelsCaption,
      post_type: 'reels',
      slides_json: reelsResult,
      quality_score_avg: validation.qualityScore,
    }))
  }

  async function processSingleResult(theme: ThemeWithMeta, captions: string[]) {
    void ctx.trackTheme(theme, captions.length)

    const sourceContext = buildSourceContext(theme)

    for (const caption of captions) {
      const validation = await validatePost({
        caption,
        languageConfig: ctx.client.languageConfig,
        label: 'single',
        platform: ctx.platform,
        sourceContext,
        qualityContext: sharedQualityContext,
      })

      const finalCaption = applyTextCorrections(caption, validation)

      pushEntry(validation, buildPostEntry(theme, {
        caption: finalCaption,
        post_type: 'single',
        slides_json: null,
        quality_score_avg: validation.qualityScore,
      }))
    }
  }
}
