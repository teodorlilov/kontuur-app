import { randomUUID } from 'crypto'
import { GeneratorFactory } from '@/ai/generation/generators/generator-factory'
import type {
  SinglePostInput, CarouselInput,
  CarouselResult, ReelsResult, DraftPost,
  GenerationResult, EnrichedTheme, GenerationRunContext,
  GenerationInput,
} from '@/ai/generation/types'
import { validatePost } from '@/ai/validation/validate-post'
import type { PostValidationResult } from '@/ai/validation/validate-post'
import { validateLanguage } from '@/ai/validation/prompts/validate-language'
import { deriveSlopFromQuality } from '@/ai/validation/content-rules/compute-scores'
import { applyTextCorrections, applySlideCorrections } from '@/ai/validation/correction-utils'
import { Deduplicator } from '@/ai/research/deduplicator'
import { ANGLE_SIMILARITY_THRESHOLD } from '@/lib/content-rules/constants'
import { toBrandQualityFields } from '@/lib/clients/fetch-client-data'
import { OVER_REQUEST_MULTIPLIER, QUALITY_FLOOR, DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'
import type { QualityResult } from '@/ai/validation/prompts/validate-quality'

const MAX_CONCURRENT_AI_CALLS = 3

/** Default quality scores for content types where quality validation is not meaningful (e.g. reels scripts). */
const DEFAULT_QUALITY_SCORE = 5

/** Default quality result for reels — quality metrics don't apply to spoken scripts. */
const DEFAULT_REELS_QUALITY: QualityResult = {
  kind: 'single',
  human_score: DEFAULT_QUALITY_SCORE,
  hook_score: DEFAULT_QUALITY_SCORE,
  cta_score: DEFAULT_QUALITY_SCORE,
  criteria_score: DEFAULT_QUALITY_SCORE,
  quality_score_avg: DEFAULT_QUALITY_SCORE,
  hook_verdict: 'clear_value',
  cta_verdict: 'clear_relevant',
  brand_voice_match: true,
  brand_voice_deviation: null,
  audience_targeting: true,
  audience_gap: null,
  niche_specificity: true,
  niche_gap: null,
  ai_tells: [],
  worst_offending_phrase: null,
  issues: [],
  opener_follows_rules: true,
  opener_violation: null,
  structure_is_predictable: false,
  structure_used: null,
  formality_consistent: true,
  formality_violation: null,
  source_fidelity_ok: null,
  health_compliant: null,
}

export async function runGenerationBatch(ctx: GenerationRunContext): Promise<GenerationResult[]> {
  const generatedPosts: GenerationResult[] = []

  // Build all themes including priority posts
  const allThemes: EnrichedTheme[] = [
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

  const getGroundingText = (theme: EnrichedTheme) => theme.sourceFullText || theme.sourceExcerpt

  const sharedQualityContext = toBrandQualityFields(ctx.client)

  const generator = GeneratorFactory.create(ctx.postType)

  function isCarouselResult(r: unknown): r is CarouselResult {
    return typeof r === 'object' && r !== null && 'main_caption' in r && 'slides' in r
  }

  function isReelsResult(r: unknown): r is ReelsResult {
    return typeof r === 'object' && r !== null && 'hook' in r && 'main_points' in r
  }

  async function generateForTheme(theme: EnrichedTheme): Promise<void> {
    const input = buildThemeInput(ctx, theme)
    const result = await generator.generate(input)

    if (ctx.postType === 'carousel' && isCarouselResult(result)) {
      await collectCarousel(theme, result)
    } else if (ctx.postType === 'reels' && isReelsResult(result)) {
      await collectReels(theme, result)
    } else if (Array.isArray(result)) {
      await collectSinglePosts(theme, result)
    } else {
      console.error(`[generate] unexpected result shape for theme "${theme.description}"`)
    }
  }

  // Process themes in batches of MAX_CONCURRENT_AI_CALLS
  for (let i = 0; i < allThemes.length; i += MAX_CONCURRENT_AI_CALLS) {
    const batch = allThemes.slice(i, i + MAX_CONCURRENT_AI_CALLS)
    const results = await Promise.allSettled(batch.map(theme => generateForTheme(theme)))

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

  function buildThemeInput(
    c: GenerationRunContext,
    theme: EnrichedTheme,
  ): SinglePostInput | CarouselInput | GenerationInput {
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
      return { ...base, slideCount: c.slideCount ?? DEFAULT_CAROUSEL_SLIDES }
    }
    if (c.postType === 'reels') {
      return { ...base }
    }
    // Single posts: over-request to ensure enough quality posts
    return {
      ...base,
      platform: c.platform,
      count: Math.ceil((theme.count || 1) * OVER_REQUEST_MULTIPLIER),
    }
  }

  function buildGroundingContext(theme: EnrichedTheme) {
    const groundingText = getGroundingText(theme)
    return ctx.requireSourceGrounding && groundingText
      ? { excerpt: groundingText, url: theme.sourceUrl }
      : undefined
  }

  function buildDraftRecord(
    theme: EnrichedTheme,
    overrides: {
      caption: string
      post_type: 'single' | 'carousel' | 'reels'
      slides_json: unknown
      carousel_quality_json?: unknown
      quality_score_avg: number
    },
  ): DraftPost {
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

  function collectResult(validation: PostValidationResult, post: DraftPost) {
    generatedPosts.push({
      post,
      quality: validation.quality,
      language: validation.language,
      slop: validation.slop,
      ...(validation.sourceGrounding ? { sourceGrounding: validation.sourceGrounding } : {}),
    })
  }

  async function validateContent(
    caption: string,
    theme: EnrichedTheme,
    opts: { slides?: CarouselResult['slides']; label: string },
  ): Promise<PostValidationResult> {
    return validatePost({
      caption,
      slides: opts.slides,
      languageConfig: ctx.client.languageConfig,
      label: opts.label,
      platform: ctx.platform,
      sourceContext: buildGroundingContext(theme),
      qualityContext: sharedQualityContext,
    })
  }

  async function collectCarousel(theme: EnrichedTheme, result: CarouselResult) {
    const expectedSlides = ctx.slideCount ?? result.slides.length
    if (result.slides.length !== expectedSlides) {
      console.warn(
        `[generate] carousel "${theme.description}": got ${result.slides.length} slides, expected ${expectedSlides}`
      )
    }

    const validation = await validateContent(result.main_caption, theme, {
      slides: result.slides,
      label: 'carousel',
    })

    void ctx.trackTheme(theme, 1)
    collectResult(validation, buildDraftRecord(theme, {
      caption: applyTextCorrections(result.main_caption, validation),
      post_type: 'carousel',
      slides_json: applySlideCorrections(result.slides, validation.language.corrected_slides),
      carousel_quality_json: validation.quality,
      quality_score_avg: validation.qualityScore,
    }))
  }

  // Language validation is meaningful for reels — checks anglicisms, calques, formality.
  // Quality validation is not — post-specific metrics do not apply to spoken scripts.
  async function collectReels(theme: EnrichedTheme, result: ReelsResult) {
    const scriptText = [result.hook, ...result.main_points, result.cta].join('\n')

    const langResult = await validateLanguage(
      { text: scriptText },
      ctx.client.languageConfig,
    ).catch(() => ({
      passes: true,
      language_score: 10,
      issues: [],
      corrected_text: null,
      corrected_slides: null,
    }))

    const slop = deriveSlopFromQuality(DEFAULT_REELS_QUALITY)

    void ctx.trackTheme(theme, 1)

    generatedPosts.push({
      post: buildDraftRecord(theme, {
        caption: langResult.corrected_text ?? scriptText,
        post_type: 'reels',
        slides_json: result,
        quality_score_avg: 0, // intentional — not meaningful for reels
      }),
      quality: DEFAULT_REELS_QUALITY,
      language: langResult,
      slop,
    })
  }

  // Step 14: Parallel validation + Step 16: Over-request with quality floor
  async function collectSinglePosts(theme: EnrichedTheme, captions: string[]) {
    void ctx.trackTheme(theme, captions.length)

    const requested = theme.count || 1

    const results = await Promise.all(
      captions.map(async (caption) => {
        const validation = await validateContent(caption, theme, { label: 'single' })
        return {
          validation,
          caption: applyTextCorrections(caption, validation),
          score: validation.qualityScore,
        }
      })
    )

    // Sort by score descending, filter by floor, keep only as many as originally requested
    const qualified = results
      .filter(r => r.score >= QUALITY_FLOOR)
      .sort((a, b) => b.score - a.score)
      .slice(0, requested)

    // Fall back to best available if all fail the floor
    const toKeep = qualified.length > 0
      ? qualified
      : results.sort((a, b) => b.score - a.score).slice(0, requested)

    toKeep.forEach(({ validation, caption }) =>
      collectResult(validation, buildDraftRecord(theme, {
        caption,
        post_type: 'single',
        slides_json: null,
        quality_score_avg: validation.qualityScore,
      }))
    )
  }
}
