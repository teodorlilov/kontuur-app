import { randomUUID } from 'crypto'
import { generatePost } from '@/ai/generation/generators/post-generator'
import { generateCarousel } from '@/ai/generation/generators/carousel-generator'
import type { ParsedPost } from '@/ai/generation/generators/post-generator'
import type { PostType } from '@/types/api'
import type {
  SinglePostInput,
  CarouselInput,
  CarouselResult,
  DraftPost,
  GenerationResult,
  EnrichedTheme,
  GenerationRunContext,
} from '@/ai/generation/types'
import { validatePost, validatePostsBatch } from '@/ai/validation/validate-post'
import type { PostValidationResult } from '@/ai/validation/validate-post'
import { applyTextCorrections, applySlideCorrections } from '@/ai/validation/correction-utils'
import { buildStoredValidation } from '@/lib/validation/stored-validation-schema'
import { Deduplicator } from '@/ai/shared/deduplicator'
import { ANGLE_SIMILARITY_THRESHOLD } from '@/lib/content-rules/constants'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'

const MAX_CONCURRENT_AI_CALLS = 5

class GenerationPipeline {
  private readonly results: GenerationResult[] = []

  constructor(private readonly ctx: GenerationRunContext) { }

  async execute(): Promise<GenerationResult[]> {
    const allThemes = this.ctx.themes ?? []
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

  private attachSimilarThemes(themes: EnrichedTheme[]): void {
    const cache = Deduplicator.buildCache(
      this.ctx.client.postHistory,
      this.ctx.client.languageConfig.language
    )
    for (const theme of themes) {
      const similar = Deduplicator.findSimilar(theme.description, cache, ANGLE_SIMILARITY_THRESHOLD)
      if (similar.length > 0) {
        theme.similarPastThemes = similar.slice(0, 3)
      }
    }
  }

  private async processTheme(theme: EnrichedTheme): Promise<void> {
    this.ctx.onProgress?.(theme.description, 'writing')
    const input = this.buildThemeInput(theme)

    if (this.ctx.postType === 'carousel') {
      await this.collectCarousel(theme, await generateCarousel(input as CarouselInput))
    } else {
      await this.collectSinglePosts(theme, await generatePost(input as SinglePostInput))
    }
  }

  /**
   * Whether this theme's post is held to its source.
   *
   * True when the client asked for it, and also whenever the theme actually carries
   * source text — a post written from a fetched article is checkable against it
   * regardless of the client's setting.
   */
  private isGrounded(theme: EnrichedTheme): boolean {
    return this.ctx.requireSourceGrounding || !!(theme.sourceExcerpt || theme.sourceFullText)
  }

  /**
   * A brief with its own platform overrides the run's; everything else inherits.
   * Prompt-cache note: system prompts cache per client+platform, so a mixed run
   * warms one extra prefix per distinct brief platform — expected and bounded.
   */
  private platformFor(theme: EnrichedTheme): string {
    return theme.platform ?? this.ctx.platform
  }

  private buildThemeInput(theme: EnrichedTheme): SinglePostInput | CarouselInput {
    const base = {
      client: this.ctx.client,
      theme: theme.description,
      targetPillar: theme.pillar,
      sourceExcerpt: theme.sourceExcerpt,
      sourceFullText: theme.sourceFullText,
      sourceUrl: theme.sourceUrl,
      requireSourceGrounding: this.isGrounded(theme),
      similarPastThemes: theme.similarPastThemes,
      brief: theme.brief,
      targetDate: theme.targetDate,
    }

    if (this.ctx.postType === 'carousel') {
      return { ...base, slideCount: this.ctx.slideCount ?? DEFAULT_CAROUSEL_SLIDES, platform: this.platformFor(theme) }
    }
    return { ...base, platform: this.platformFor(theme), count: theme.count || 1 }
  }

  private buildGroundingContext(theme: EnrichedTheme) {
    // No re-slice: sourceFullText is already capped once, at attachment, by
    // SOURCE_FULL_TEXT_CAP (fetch-limits.ts). Cutting it again here handed the
    // judge less text than the writer saw, so claims sourced from the tail were
    // flagged as fabricated.
    const groundingText = theme.sourceFullText || theme.sourceExcerpt
    // Same predicate the writer is given. These disagreed: the writer was told to
    // stay grounded whenever a source was present, while the judge only checked
    // when the client flag was set — so the fabricated-statistic check was off for
    // exactly the posts that quote fetched source text.
    return this.isGrounded(theme) && groundingText
      ? { excerpt: groundingText, url: theme.sourceUrl }
      : undefined
  }

  private buildDraftRecord(
    theme: EnrichedTheme,
    overrides: {
      caption: string
      post_type: PostType
      slides_json: unknown
      validation_json?: unknown
      quality_score_avg: number | null
    }
  ): DraftPost {
    return {
      id: randomUUID(),
      client_id: this.ctx.client.id,
      platform: this.platformFor(theme),
      status: 'draft',
      priority: theme.isPriority ?? false,
      topic_summary: theme.description,
      source_url: theme.sourceUrl ?? null,
      source_title: theme.sourceTitle ?? null,
      source_type: theme.sourceType ?? null,
      source_excerpt: theme.sourceExcerpt ?? null,
      client_source_id: theme.clientSourceId ?? null,
      pillar: theme.pillar ?? null,
      target_date: theme.targetDate ?? null,
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

    this.ctx.onProgress?.(theme.description, 'validating')
    const validation = await validatePost({
      caption: result.main_caption,
      slides: result.slides,
      client: this.ctx.client,
      platform: this.platformFor(theme),
      sourceContext: this.buildGroundingContext(theme),
      theme: theme.description,
      targetPillar: theme.pillar,
      label: 'carousel',
    })

    await this.trackThemeSafe(theme, 1)
    this.collectResult(
      validation,
      this.buildDraftRecord(theme, {
        caption: applyTextCorrections(result.main_caption, validation),
        post_type: 'carousel',
        slides_json: applySlideCorrections(result.slides, validation.language.corrected_slides),
        validation_json: buildStoredValidation(validation),
        quality_score_avg: validation.qualityScore,
      })
    )
  }

  /** Theme tracking is best-effort — a failed insert must not sink the generation batch. */
  private async trackThemeSafe(theme: EnrichedTheme, postCount: number): Promise<void> {
    try {
      await this.ctx.trackTheme(theme, postCount)
    } catch (err) {
      console.error(`[generate] failed to track theme "${theme.description}":`, err)
    }
  }

  private async collectSinglePosts(theme: EnrichedTheme, posts: ParsedPost[]): Promise<void> {
    const requested = theme.count || 1
    // Track what the run will keep, not how many variants the writer produced —
    // the latter made live progress climb past 100%.
    await this.trackThemeSafe(theme, Math.min(requested, posts.length))

    this.ctx.onProgress?.(theme.description, 'validating')
    // Validate all variants of this theme in one batched pass, then pick the best
    const validations = await validatePostsBatch({
      captions: posts.map(({ caption }) => caption),
      client: this.ctx.client,
      platform: this.platformFor(theme),
      sourceContext: this.buildGroundingContext(theme),
      theme: theme.description,
      targetPillar: theme.pillar,
      label: 'single',
    })
    const results = posts.map(({ caption }, i) => {
      const validation = validations[i]!
      return {
        validation,
        caption: applyTextCorrections(caption, validation),
        score: validation.qualityScore,
      }
    })

    // Ranked, not gated. A low score is surfaced rather than acted on here: triage
    // flags the post `low_quality` and routes it to needs_attention, so it never
    // reaches the ready bucket or a bulk approve. Dropping it at this point would
    // discard written work silently and leave the run shorter than it promised.
    //
    // This used to filter on QUALITY_FLOOR and then fall back to the unfiltered
    // list when nothing qualified — which, with one caption per theme, returned the
    // same single item either way. The gate read as real and decided nothing.
    // Unscored variants sort last rather than coalescing to 0, which would rank
    // them below a measured 3. They are still kept if nothing scored — a judge
    // outage must not empty the run.
    const toKeep = [...results]
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(0, requested)

    toKeep.forEach(({ validation, caption }) =>
      this.collectResult(
        validation,
        this.buildDraftRecord(theme, {
          caption,
          post_type: 'single',
          slides_json: null,
          validation_json: buildStoredValidation(validation),
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
 