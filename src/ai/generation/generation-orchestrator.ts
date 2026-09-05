import { randomUUID } from 'crypto'
import { generatePost, revisePost } from '@/ai/generation/generators/post-generator'
import { generateCarousel, reviseCarousel } from '@/ai/generation/generators/carousel-generator'
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
import { selectGroundingText } from '@/ai/generation/prompts/source-grounding'
import { validatePost, validatePostsBatch } from '@/ai/validation/validate-post'
import type { PostValidationResult } from '@/ai/validation/validate-post'
import { applyPostCorrections } from '@/ai/validation/correction-utils'
import { buildStoredValidation } from '@/lib/validation/stored-validation-schema'
import { Deduplicator } from '@/ai/shared/deduplicator'
import { ANGLE_SIMILARITY_THRESHOLD } from '@/lib/content-rules/constants'
import { DEFAULT_CAROUSEL_SLIDES } from '@/utils/constants'

const MAX_CONCURRENT_AI_CALLS = 5

// Refine-loop bounds. The cap is the run's cost/latency protection — the cron's
// time-budget check only runs BETWEEN clients, so nothing else stops a client's
// batch from ballooning mid-flight. The per-theme budget skips revision when a
// theme has already burned its share of the route's 300s ceiling.
const MAX_REVISIONS_PER_RUN = 3
const REVISION_THEME_BUDGET_MS = 90_000

class GenerationPipeline {
  private readonly results: GenerationResult[] = []
  private revisionsUsed = 0

  constructor(private readonly ctx: GenerationRunContext) {}

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
    const startedAt = Date.now()
    const input = this.buildThemeInput(theme)

    if (this.ctx.postType === 'carousel') {
      await this.collectCarousel(theme, await generateCarousel(input as CarouselInput), startedAt)
    } else {
      await this.collectSinglePosts(theme, await generatePost(input as SinglePostInput), startedAt)
    }
  }

  /**
   * What a judge text-fix cannot repair, phrased for the writer: structure
   * failures, and language issues the judge flagged without supplying the
   * corrected text (a contract violation the prompt forbids but cannot prevent).
   * Empty array = nothing worth a revision round.
   */
  private revisionNotes(validation: PostValidationResult): string[] {
    const notes: string[] = []
    const structure = validation.criteria.structure_followed
    if (structure && !structure.passes) notes.push(...structure.notes)
    const lang = validation.language
    if (lang.issues.length > 0 && !lang.corrected_text && !lang.corrected_slides) {
      notes.push(...lang.issues.map((i) => `${i.type}: "${i.original_text}" → ${i.suggested_fix}`))
    }
    return notes
  }

  private canRevise(startedAt: number): boolean {
    return (
      this.revisionsUsed < MAX_REVISIONS_PER_RUN &&
      Date.now() - startedAt < REVISION_THEME_BUDGET_MS
    )
  }

  /**
   * Ranked, not gated, extended to the refine loop: the revision is a second
   * candidate, never a replacement — an unjudged revision (null score) loses to
   * the judged original, the same judge-outage principle the ranking uses.
   */
  private pickBetter<T extends { validation: PostValidationResult }>(original: T, revised: T): T {
    const o = original.validation.scores.overall_score
    const r = revised.validation.scores.overall_score
    if (r === null) return original
    if (o === null) return revised
    if (r !== o) return r > o ? revised : original
    return revised.validation.language.issues.length < original.validation.language.issues.length
      ? revised
      : original
  }

  private buildThemeInput(theme: EnrichedTheme): SinglePostInput | CarouselInput {
    const base = {
      client: this.ctx.client,
      theme: theme.description,
      targetPillar: theme.pillar,
      sourceExcerpt: theme.sourceExcerpt,
      sourceFullText: theme.sourceFullText,
      sourceUrl: theme.sourceUrl,
      similarPastThemes: theme.similarPastThemes,
      brief: theme.brief,
      targetDate: theme.targetDate,
    }

    if (this.ctx.postType === 'carousel') {
      return {
        ...base,
        slideCount: this.ctx.slideCount ?? DEFAULT_CAROUSEL_SLIDES,
      }
    }
    return { ...base, count: theme.count || 1 }
  }

  private buildGroundingContext(theme: EnrichedTheme) {
    // The SAME selector the writer prompt uses — the two used to each write
    // `sourceFullText || sourceExcerpt` inline and could silently diverge. The
    // judge checks against `primary` only: for non-English carousels the writer
    // also sees the English full text as background, but is forbidden to take
    // facts from it, so a background-sourced claim SHOULD flag as ungrounded.
    // No re-slice (SOURCE_FULL_TEXT_CAP applied once at attachment) — cutting
    // again handed the judge less text than the writer saw.
    const { primary } = selectGroundingText(
      theme,
      this.ctx.client.languageConfig.language,
      this.ctx.postType
    )
    // Same predicate the writer is given: source text present means the post is
    // checked against it, always. No client toggle sits in front of this — one
    // existed, could not change the outcome either way, and was removed.
    return primary ? { excerpt: primary, url: theme.sourceUrl } : undefined
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

  private validateCarousel(theme: EnrichedTheme, result: CarouselResult) {
    return validatePost({
      caption: result.main_caption,
      slides: result.slides,
      client: this.ctx.client,
      sourceContext: this.buildGroundingContext(theme),
      theme: theme.description,
      targetPillar: theme.pillar,
      label: 'carousel',
    })
  }

  private async collectCarousel(
    theme: EnrichedTheme,
    result: CarouselResult,
    startedAt: number
  ): Promise<void> {
    const expectedSlides = this.ctx.slideCount ?? result.slides.length
    if (result.slides.length !== expectedSlides) {
      console.warn(
        `[generate] carousel "${theme.description}": got ${result.slides.length} slides, expected ${expectedSlides}`
      )
    }

    this.ctx.onProgress?.(theme.description, 'validating')
    const validation = await this.validateCarousel(theme, result)

    let chosen = { result, validation }
    const notes = this.revisionNotes(validation)
    if (notes.length > 0 && this.canRevise(startedAt)) {
      this.revisionsUsed++
      this.ctx.onProgress?.(theme.description, 'refining')
      try {
        const revised = await reviseCarousel(
          this.buildThemeInput(theme) as CarouselInput,
          result,
          notes
        )
        if (revised) {
          const revalidation = await this.validateCarousel(theme, revised)
          chosen = this.pickBetter(chosen, { result: revised, validation: revalidation })
        }
      } catch (err) {
        console.error(`[generate] carousel revision failed for "${theme.description}":`, err)
      }
    }

    await this.trackThemeSafe(theme, 1)
    // The saved copy and its verdict must describe the same text: corrections
    // land in the copy, and the language score is re-scored over what shipped.
    const applied = applyPostCorrections(
      chosen.result.main_caption,
      chosen.result.slides,
      chosen.validation
    )
    this.collectResult(
      applied.validation,
      this.buildDraftRecord(theme, {
        caption: applied.caption,
        post_type: 'carousel',
        slides_json: applied.slides,
        validation_json: buildStoredValidation(applied.validation),
        quality_score_avg: applied.validation.qualityScore,
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

  private validateSingles(theme: EnrichedTheme, captions: string[]) {
    return validatePostsBatch({
      captions,
      client: this.ctx.client,
      sourceContext: this.buildGroundingContext(theme),
      theme: theme.description,
      targetPillar: theme.pillar,
      label: 'single',
    })
  }

  private async collectSinglePosts(
    theme: EnrichedTheme,
    posts: ParsedPost[],
    startedAt: number
  ): Promise<void> {
    const requested = theme.count || 1
    // Track what the run will keep, not how many variants the writer produced —
    // the latter made live progress climb past 100%.
    await this.trackThemeSafe(theme, Math.min(requested, posts.length))

    this.ctx.onProgress?.(theme.description, 'validating')
    // Validate all variants of this theme in one batched pass, then pick the best
    const validations = await this.validateSingles(
      theme,
      posts.map(({ caption }) => caption)
    )
    const results = posts.map(({ caption }, i) => ({ validation: validations[i]!, caption }))

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
      .sort((a, b) => (b.validation.qualityScore ?? -1) - (a.validation.qualityScore ?? -1))
      .slice(0, requested)

    // Revision runs on kept variants only — a discarded variant's flaws cost nothing.
    for (let item of toKeep) {
      const notes = this.revisionNotes(item.validation)
      if (notes.length > 0 && this.canRevise(startedAt)) {
        this.revisionsUsed++
        this.ctx.onProgress?.(theme.description, 'refining')
        try {
          const revised = await revisePost(
            this.buildThemeInput(theme) as SinglePostInput,
            item.caption,
            notes
          )
          if (revised) {
            const [revalidation] = await this.validateSingles(theme, [revised])
            item = this.pickBetter(item, { validation: revalidation!, caption: revised })
          }
        } catch (err) {
          console.error(`[generate] revision failed for "${theme.description}":`, err)
        }
      }

      const applied = applyPostCorrections(item.caption, null, item.validation)
      this.collectResult(
        applied.validation,
        this.buildDraftRecord(theme, {
          caption: applied.caption,
          post_type: 'single',
          slides_json: null,
          validation_json: buildStoredValidation(applied.validation),
          quality_score_avg: applied.validation.qualityScore,
        })
      )
    }
  }
}

/** Backwards-compatible entry point for API routes. */
export async function runGenerationBatch(ctx: GenerationRunContext): Promise<GenerationResult[]> {
  return new GenerationPipeline(ctx).execute()
}
