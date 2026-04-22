import { randomUUID } from 'crypto'
import { generatePost } from '@/ai/generation/generators/post-generator'
import { generateCarousel } from '@/ai/generation/generators/carousel-generator'
import type { ParsedPost } from '@/ai/generation/generators/post-generator'
import type {
  SinglePostInput,
  CarouselInput,
  CarouselResult,
  DraftPost,
  GenerationResult,
  EnrichedTheme,
  GenerationRunContext,
} from '@/ai/generation/types'
import { validatePost } from '@/ai/validation/validate-post'
import type { PostValidationResult } from '@/ai/validation/validate-post'
import { applyTextCorrections, applySlideCorrections } from '@/ai/validation/correction-utils'
import { Deduplicator } from '@/ai/shared/deduplicator'
import { ANGLE_SIMILARITY_THRESHOLD } from '@/lib/content-rules/constants'
import { QUALITY_FLOOR, DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'

const MAX_CONCURRENT_AI_CALLS = 5

export class GenerationPipeline {
  private readonly results: GenerationResult[] = []

  constructor(private readonly ctx: GenerationRunContext) { }

  async execute(): Promise<GenerationResult[]> {
    const allThemes = this.buildThemeList()
    this.attachSimilarThemes(allThemes)

    for (let i = 0; i < allThemes.length; i += MAX_CONCURRENT_AI_CALLS) {
      const batch = allThemes.slice(i, i + MAX_CONCURRENT_AI_CALLS)
      const settled = await Promise.allSettled(batch.map((t) => this.processTheme(t)))
      settled.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(
            `[generate] failed to process theme "${batch[idx]?.description}":`,
            result.reason
          )
        }
      })
    }

    return this.results
  }

  private buildThemeList(): EnrichedTheme[] {
    const themeList = [
      ...(this.ctx.priorityPosts ?? []).map((pp) => ({
        description: pp.title,
        count: 1,
        isPriority: true,
        brief: pp.brief,
        targetDate: pp.targetDate,
      })),
      ...(this.ctx.themes ?? []),
    ]
    return themeList
  }

  private attachSimilarThemes(themes: EnrichedTheme[]): void {
    for (const theme of themes) {
      const similar = this.ctx.client.postHistory.filter(
        (topic) =>
          Deduplicator.ngramSimilarity(
            theme.description,
            topic,
            this.ctx.client.languageConfig.language
          ) > ANGLE_SIMILARITY_THRESHOLD
      )
      if (similar.length > 0) {
        theme.similarPastThemes = similar.slice(0, 3)
      }
    }
  }

  private async processTheme(theme: EnrichedTheme): Promise<void> {
    this.ctx.onProgress?.(theme.description)
    const input = this.buildThemeInput(theme)

    if (this.ctx.postType === 'carousel') {
      await this.collectCarousel(theme, await generateCarousel(input as CarouselInput))
    } else {
      await this.collectSinglePosts(theme, await generatePost(input as SinglePostInput))
    }
  }

  private buildThemeInput(theme: EnrichedTheme): SinglePostInput | CarouselInput {
    const hasGrounding = !!(theme.sourceExcerpt || theme.sourceFullText)
    const base = {
      client: this.ctx.client,
      theme: theme.description,
      targetPillar: theme.pillar,
      sourceExcerpt: theme.sourceExcerpt,
      sourceFullText: theme.sourceFullText,
      sourceUrl: theme.sourceUrl,
      requireSourceGrounding: this.ctx.requireSourceGrounding || hasGrounding,
      similarPastThemes: theme.similarPastThemes,
      brief: theme.brief,
      targetDate: theme.targetDate,
    }

    if (this.ctx.postType === 'carousel') {
      return { ...base, slideCount: this.ctx.slideCount ?? DEFAULT_CAROUSEL_SLIDES, platform: this.ctx.platform }
    }
    return { ...base, platform: this.ctx.platform, count: theme.count || 1 }
  }

  private buildGroundingContext(theme: EnrichedTheme) {
    const MAX_SOURCE_CHARS = 3000
    const groundingText = (theme.sourceExcerpt || theme.sourceFullText)?.slice(0, MAX_SOURCE_CHARS)
    return this.ctx.requireSourceGrounding && groundingText
      ? { excerpt: groundingText, url: theme.sourceUrl }
      : undefined
  }

  private buildDraftRecord(
    theme: EnrichedTheme,
    overrides: {
      caption: string
      post_type: 'single' | 'carousel'
      slides_json: unknown
      validation_json?: unknown
      quality_score_avg: number
    }
  ): DraftPost {
    return {
      id: randomUUID(),
      client_id: this.ctx.client.id,
      platform: this.ctx.platform,
      status: 'draft',
      priority: theme.isPriority ?? false,
      topic_summary: theme.description,
      source_url: theme.sourceUrl ?? null,
      source_title: theme.sourceTitle ?? null,
      source_type: theme.sourceType ?? null,
      source_excerpt: theme.sourceExcerpt ?? null,
      pillar: theme.pillar ?? null,
      validation_json: null,
      created_at: new Date().toISOString(),
      ...overrides,
    }
  }

  private collectResult(validation: PostValidationResult, post: DraftPost): void {
    const item: GenerationResult = {
      post,
      language: validation.language,
      slop: validation.slop,
      criteria: validation.criteria,
      scores: validation.scores,
      ...(validation.sourceGrounding ? { sourceGrounding: validation.sourceGrounding } : {}),
    }
    this.results.push(item)
    this.ctx.onResult?.(item)
  }

  private async collectCarousel(theme: EnrichedTheme, result: CarouselResult): Promise<void> {
    const expectedSlides = this.ctx.slideCount ?? result.slides.length
    if (result.slides.length !== expectedSlides) {
      console.warn(
        `[generate] carousel "${theme.description}": got ${result.slides.length} slides, expected ${expectedSlides}`
      )
    }

    const validation = await validatePost({
      caption: result.main_caption,
      slides: result.slides,
      client: this.ctx.client,
      platform: this.ctx.platform,
      sourceContext: this.buildGroundingContext(theme),
      theme: theme.description,
      targetPillar: theme.pillar,
      label: 'carousel',
    })

  
    void this.ctx.trackTheme(theme, 1)
    this.collectResult(
      validation,
      this.buildDraftRecord(theme, {
        caption: applyTextCorrections(result.main_caption, validation),
        post_type: 'carousel',
        slides_json: applySlideCorrections(result.slides, validation.language.corrected_slides),
        validation_json: { criteria: validation.criteria, scores: validation.scores },
        quality_score_avg: validation.qualityScore,
      })
    )
  }

  private async collectSinglePosts(theme: EnrichedTheme, posts: ParsedPost[]): Promise<void> {
    void this.ctx.trackTheme(theme, posts.length)
    const requested = theme.count || 1

    // Validate all generated posts, then pick the best
    const results = await Promise.all(
      posts.map(async ({ caption, declaredStructure }) => {
        const validation = await validatePost({
          caption,
          client: this.ctx.client,
          platform: this.ctx.platform,
          sourceContext: this.buildGroundingContext(theme),
          theme: theme.description,
          targetPillar: theme.pillar,
          declaredStructure: declaredStructure ?? undefined,
          label: 'single',
        })
        return {
          validation,
          caption: applyTextCorrections(caption, validation),
          score: validation.qualityScore,
        }
      })
    )

    const qualified = results
      .filter((r) => r.score >= QUALITY_FLOOR)
      .sort((a, b) => b.score - a.score)
      .slice(0, requested)

    const toKeep =
      qualified.length > 0
        ? qualified
        : results.sort((a, b) => b.score - a.score).slice(0, requested)

    toKeep.forEach(({ validation, caption }) =>
      this.collectResult(
        validation,
        this.buildDraftRecord(theme, {
          caption,
          post_type: 'single',
          slides_json: null,
          validation_json: { criteria: validation.criteria, scores: validation.scores },
          quality_score_avg: validation.qualityScore,
        })
      )
    )
  }

}

/** Backwards-compatible entry point for API routes. */
export async function runGenerationBatch(ctx: GenerationRunContext): Promise<GenerationResult[]> {
  return new GenerationPipeline(ctx).execute()
}
 