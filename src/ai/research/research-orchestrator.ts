import 'server-only'

import {
  fetchClientSources,
  fetchUsedSourceUrls,
  fetchSourceUsageStats,
  fetchRecentPillarCounts,
  type SourceUsageStats,
} from '@/lib/queries/db'
import { fetchThemeDescriptions } from '@/lib/generation/runs'
import { searchTrends } from '@/lib/sources/fetch-trend-search'
import {
  allocateByWeight,
  getSourcePillarIds,
  resolvePillarNames,
  pillarHasSources,
} from '@/lib/clients/content-pillars'
import type { TavilyConfig } from '@/types/sources'
import { createAllSources } from './sources/source-factory'
import { ResearchSource } from './sources/research-source'
import { rankSourceItems, RANK_MIN_ITEMS } from './rank-source-items'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchPerformanceItems } from './performance-source'
import { ResearchPromptBuilder } from './prompts/prompt-builder'
import { generateTopics, generateTopUpTopics } from './generators/topic-generator'
import { computeFetchLimits, SOURCE_FULL_TEXT_CAP } from './fetch-limits'
import type {
  ResearchRunContext,
  ResearchTopic,
  SourceContext,
  ClientSourceRow,
  FetchLimits,
  SourceFullTextIndex,
  SourceAttributionIndex,
  SkippedPillar,
  FileExcerpt,
} from './types'
import type { ClientData } from '@/lib/clients/fetch-client-data'

interface ResearchClientData extends ClientData {
  sources: ClientSourceRow[]
  history: string[]
  usedUrls: string[]
  sourceStats: SourceUsageStats[]
  recentPillarCounts: Map<string, number>
}

/** Round-robin interleave: one item per list per pass, until the cap is reached. */
export function interleaveRoundRobin<T>(lists: T[][], cap: number): T[] {
  const result: T[] = []
  const maxLength = Math.max(0, ...lists.map((list) => list.length))

  for (let pass = 0; pass < maxLength && result.length < cap; pass++) {
    for (const list of lists) {
      if (result.length >= cap) break
      const item = list[pass]
      if (item !== undefined) result.push(item)
    }
  }
  return result
}

/**
 * Orchestrates the full research pipeline: source fetching → LLM topic generation → deduplication.
 * Uses polymorphic source classes (RSS, Website, File) via the SourceFactory.
 */
export class ResearchPipeline {
  private readonly ctx: ResearchRunContext

  constructor(ctx: ResearchRunContext) {
    this.ctx = ctx
  }

  /** Execute the full research pipeline. Main entry point. */
  async execute(): Promise<ResearchTopic[]> {
    this.ctx.onPhase?.('Loading brand profile...')
    const clientData = await this.loadClientData()
    const limits = computeFetchLimits(this.ctx.count)
    const requestedCount = this.ctx.count
    const pillars = clientData.contentPillars

    this.ctx.onPhase?.('Fetching sources...')

    // Separate tavily row (not a ResearchSource — uses searchTrends API)
    const tavilyRow = clientData.sources.find((r) => r.type === 'tavily')
    const nonTavilySources = clientData.sources.filter((r) => r.type !== 'tavily')
    const sourceObjects = createAllSources(nonTavilySources)

    // Pre-cache pillar names per source to avoid redundant resolution in buildSourceContext
    const pillarNamesById = new Map<string, string[]>()
    for (const s of sourceObjects) {
      pillarNamesById.set(s.id, resolvePillarNames(getSourcePillarIds(s.pillarIds), pillars))
    }

    const shouldSearchWeb = !!tavilyRow
    const tavilyConfig = (tavilyRow?.config ?? {}) as TavilyConfig

    // Soft-skip: with web research active, no pillar is skipped upfront — search
    // can serve any topic. Pre-skip only applies when tavily is off AND a
    // pillar has no eligible sources at all.
    let effectivePillars = pillars
    let preSkippedPillars: SkippedPillar[] = []
    if (!tavilyRow) {
      const allSourcePillarIds = sourceObjects.map((s) => getSourcePillarIds(s.pillarIds))
      effectivePillars = pillars.filter((p) => pillarHasSources(p.id, allSourcePillarIds))
      preSkippedPillars = pillars
        .filter((p) => !pillarHasSources(p.id, allSourcePillarIds))
        .map((p) => ({ name: p.pillar }))
    }

    const [, allWebSearchItems, performanceItems] = await Promise.all([
      this.fetchAllSources(sourceObjects, limits),
      shouldSearchWeb
        ? searchTrends(this.ctx.niche, requestedCount + 2, {
            targetAudience: clientData.targetAudience,
            contentPillars: effectivePillars,
            postHistory: clientData.history,
            language: clientData.language,
            excludedUrls: clientData.usedUrls,
            tavilyConfig,
          })
        : Promise.resolve([]),
      this.ctx.clientId
        ? fetchPerformanceItems(this.ctx.supabase, this.ctx.clientId)
        : Promise.resolve([]),
    ])

    // Tag web search items with tavily source's eligible pillars
    const tavilyPillarNames = tavilyRow
      ? resolvePillarNames(getSourcePillarIds(tavilyRow.pillar_ids), pillars)
      : []
    const webSearchItems = shouldSearchWeb
      ? allWebSearchItems.map((r) => ({
          ...r,
          ...(tavilyPillarNames.length > 0 ? { eligiblePillars: tavilyPillarNames } : {}),
          ...(tavilyRow ? { clientSourceId: tavilyRow.id } : {}),
        }))
      : []

    const clientSourceContext = this.buildSourceContext(sourceObjects, limits, pillarNamesById)

    const hasAnySources =
      clientSourceContext.rssItems.length > 0 ||
      clientSourceContext.websiteExcerpts.length > 0 ||
      clientSourceContext.fileExcerpts.length > 0 ||
      webSearchItems.length > 0

    if (!hasAnySources) {
      this.ctx.onPhase?.('No source material found')
      return []
    }

    // Visible proof the performance source fired — streams to the wizard's loading UI
    if (performanceItems.length > 0) {
      this.ctx.onPhase?.(`Analyzing ${performanceItems.length} top Instagram posts...`)
    }

    const gatheredContext: SourceContext = {
      ...clientSourceContext,
      webSearchItems: webSearchItems.length > 0 ? webSearchItems : undefined,
      performanceItems: performanceItems.length > 0 ? performanceItems : undefined,
    }

    // Performance items bypass the ranker: <=5 curated, audience-proven entries.
    // Only announce ranking when it will actually run (rankSourceItems skips
    // below RANK_MIN_ITEMS) so the phase message never flashes on a no-op.
    const rankableCount =
      gatheredContext.rssItems.length + (gatheredContext.webSearchItems?.length ?? 0)
    if (rankableCount >= RANK_MIN_ITEMS) {
      this.ctx.onPhase?.('Ranking source material...')
    }
    const effectiveContext = await rankSourceItems(gatheredContext, {
      niche: this.ctx.niche,
      targetAudience: clientData.targetAudience,
      contentPillars: effectivePillars,
      sourceStats: clientData.sourceStats,
    })

    this.ctx.onPhase?.('Generating theme ideas...')
    const builder = new ResearchPromptBuilder({
      niche: this.ctx.niche,
      languageConfig: clientData.languageConfig,
      contentPillars: effectivePillars,
      postHistory: clientData.history,
      excludedUrls: clientData.usedUrls,
      recentPillarCounts: clientData.recentPillarCounts,
    })

    const topics = await generateTopics(builder, requestedCount, effectiveContext)

    // Filter LLM-hallucinated topics (no source URL except file/performance,
    // which legitimately may lack one — docs have no URL, IG permalinks can be absent)
    const isGrounded = (t: ResearchTopic) =>
      !!t.suggested_theme?.trim() &&
      (!!t.source_url || t.source_type === 'file' || t.source_type === 'performance')
    const groundedTopics = topics.filter(isGrounded)

    // One top-up round recovers grounding-filter losses instead of silently
    // delivering fewer posts than requested
    if (groundedTopics.length < requestedCount) {
      const shortfall = requestedCount - groundedTopics.length
      this.ctx.onPhase?.('Replacing ungrounded topics...')
      try {
        const extraTopics = await generateTopUpTopics(
          builder,
          requestedCount,
          shortfall,
          effectiveContext,
          topics,
          groundedTopics.map((t) => t.suggested_theme)
        )
        const seen = new Set(groundedTopics.map((t) => `${t.suggested_theme}|${t.source_url ?? ''}`))
        for (const topic of extraTopics.filter(isGrounded)) {
          const key = `${topic.suggested_theme}|${topic.source_url ?? ''}`
          if (seen.has(key)) continue
          seen.add(key)
          groundedTopics.push(topic)
        }
      } catch (err) {
        console.warn('[research] topic top-up failed, continuing with fewer topics:', err)
      }
    }

    // Detect skipped pillars. Only a pillar the prompt asked topics of can be
    // "skipped by research" — at small run sizes the allocation instructs the
    // LLM to generate 0 for most pillars, and those are rotation, not failures.
    // Same allocateByWeight call as buildPillarAllocationBlock, so the ask
    // here matches what the prompt actually said.
    const asked = allocateByWeight(effectivePillars, requestedCount, clientData.recentPillarCounts)
    const coveredPillars = new Set(groundedTopics.map((t) => t.pillar).filter(Boolean))
    const postLlmSkipped: SkippedPillar[] = effectivePillars
      .filter((p) => (asked.get(p.pillar) ?? 0) > 0 && !coveredPillars.has(p.pillar))
      .map((p) => ({ name: p.pillar }))
    const skippedPillars = [...preSkippedPillars, ...postLlmSkipped]

    if (skippedPillars.length > 0) {
      const allocation = allocateByWeight(clientData.contentPillars, requestedCount)
      const skippedCount = skippedPillars.reduce(
        (sum, p) => sum + (allocation.get(p.name) ?? 0),
        0
      )
      this.ctx.onSkippedPillars?.(skippedPillars, skippedCount)
    }

    this.attachSourceFullText(groundedTopics, this.buildSourceFullTextIndex(sourceObjects))
    this.attachSourceAttribution(
      groundedTopics,
      this.buildSourceAttributionIndex(sourceObjects, tavilyRow ?? null)
    )
    const finalTopics = groundedTopics.slice(0, requestedCount)
    for (const topic of finalTopics) this.ctx.onTopic?.(topic)
    return finalTopics
  }

  /** Load brand profile, post history, generation themes, and client sources. */
  private async loadClientData(): Promise<ResearchClientData> {
    // Preloaded path — wizard always passes ClientData with full context
    if (this.ctx.preloadedClientData) {
      const data: ClientData = this.ctx.preloadedClientData
      const [sources, themeHistory, usedUrls, sourceStats, recentPillarCounts] = await Promise.all([
        this.ctx.clientId
          ? fetchClientSources(this.ctx.supabase, this.ctx.clientId)
          : Promise.resolve([]),
        this.ctx.clientId
          ? fetchThemeDescriptions(this.ctx.supabase, this.ctx.clientId)
          : Promise.resolve([]),
        this.ctx.clientId
          ? fetchUsedSourceUrls(this.ctx.supabase, this.ctx.clientId)
          : Promise.resolve([]),
        this.ctx.clientId
          ? // discarded_drafts is RLS-locked with no policies (admin-only); the
            // user-scoped client would read zero discards, so stats go through
            // the admin client — ownership is already verified by the caller.
            fetchSourceUsageStats(createAdminSupabaseClient(), this.ctx.clientId).catch((err) => {
              // Learn-loop input is optional — never block research on it
              console.warn('[research] source usage stats unavailable:', err)
              return []
            })
          : Promise.resolve([]),
        this.ctx.clientId
          ? fetchRecentPillarCounts(this.ctx.supabase, this.ctx.clientId).catch((err) => {
              console.warn('[research] recent pillar counts unavailable:', err)
              return new Map<string, number>()
            })
          : Promise.resolve(new Map<string, number>()),
      ])

      return {
        ...data,
        sources,
        history: [...data.postHistory, ...themeHistory],
        usedUrls,
        sourceStats,
        recentPillarCounts,
      }
    }

    throw new Error('[research] No preloaded client data')
  }

  /** Fetch all sources in parallel. Reports status to DB for network sources. */
  private async fetchAllSources(sources: ResearchSource[], limits: FetchLimits): Promise<void> {
    const networkSources = sources.filter((s) => s.isNetworkFetchable())
    const fileSources = sources.filter((s) => !s.isNetworkFetchable())

    await Promise.allSettled(
      networkSources.map(async (source) => {
        const result = await source.fetch(limits)
        void source.reportStatus(this.ctx.supabase, result).catch((err: unknown) => {
          console.error('[research] reportStatus failed:', err)
        })
      })
    )

    // File sources: no-op fetch, no network call, no status report
    await Promise.all(fileSources.map((source) => source.fetch()))
  }

  /**
   * Build the SourceContext from fetched source objects.
   * Tags each item with eligible pillar names based on the source's pillar_ids.
   */
  private buildSourceContext(
    sources: ResearchSource[],
    limits: FetchLimits,
    pillarNamesById: Map<string, string[]>
  ): SourceContext {
    // RSS: round-robin across sources so every feed gets a fair share of the
    // global cap — a flat concat let DB insertion order decide who fills it
    const rssItemsPerSource = sources.map((s) => {
      const names = pillarNamesById.get(s.id) ?? []
      return s.getRssItems().map((item) => ({
        ...item,
        ...(names.length > 0 ? { eligiblePillars: names } : {}),
        clientSourceId: s.id,
      }))
    })
    const cappedRssItems = interleaveRoundRobin(rssItemsPerSource, limits.rssGlobalCap)

    // Website: distribute scaled web budget, tag with eligible pillars
    const allWebExcerpts = sources.flatMap((s) => {
      const names = pillarNamesById.get(s.id) ?? []
      return s.getWebExcerpts().map((w) =>
        names.length > 0 ? { ...w, eligiblePillars: names } : w
      )
    })
    const perWebBudget =
      allWebExcerpts.length > 0 ? Math.floor(limits.webBudget / allWebExcerpts.length) : 0
    const cappedWebExcerpts = allWebExcerpts
      .map((w) => ({ ...w, text: w.text.slice(0, perWebBudget) }))
      .filter((w) => w.text.length > 0)

    // File: distribute scaled file budget, tag with eligible pillars
    const sourcesWithFiles = sources.filter((s) => s.hasFileContent())
    const perFileBudget =
      sourcesWithFiles.length > 0 ? Math.floor(limits.fileBudget / sourcesWithFiles.length) : 0
    const cappedFileExcerpts: FileExcerpt[] = sourcesWithFiles
      .map((s) => {
        const names = pillarNamesById.get(s.id) ?? []
        const excerpt = s.getFileExcerpt(perFileBudget)
        if (!excerpt) return null
        return names.length > 0 ? { ...excerpt, eligiblePillars: names } : excerpt
      })
      .filter((f): f is FileExcerpt => f !== null)

    return {
      rssItems: cappedRssItems,
      websiteExcerpts: cappedWebExcerpts,
      fileExcerpts: cappedFileExcerpts,
    }
  }

  /** Build full-text index from source objects for source grounding. */
  private buildSourceFullTextIndex(sources: ResearchSource[]): SourceFullTextIndex {
    const byUrl = new Map<string, string>()
    const byLabel = new Map<string, string>()

    for (const source of sources) {
      source.addToFullTextIndex(byUrl, byLabel, SOURCE_FULL_TEXT_CAP)
    }

    return { byUrl, byLabel }
  }

  /** Attach full source text to topics based on their source metadata. */
  private attachSourceFullText(topics: ResearchTopic[], index: SourceFullTextIndex): void {
    for (const topic of topics) {
      if (topic.source_url && index.byUrl.has(topic.source_url)) {
        topic.source_full_text = index.byUrl.get(topic.source_url)
      } else if (topic.source_type === 'file' && topic.source_title) {
        topic.source_full_text = index.byLabel.get(topic.source_title)
      }
    }
  }

  /** Build url/label → client_sources id maps for outcome attribution. */
  private buildSourceAttributionIndex(
    sources: ResearchSource[],
    tavilyRow: ClientSourceRow | null
  ): SourceAttributionIndex {
    const byUrl = new Map<string, string>()
    const byLabel = new Map<string, string>()

    for (const source of sources) {
      source.addToAttributionIndex(byUrl, byLabel)
    }

    return { byUrl, byLabel, tavilySourceId: tavilyRow?.id ?? null }
  }

  /** Resolve each topic's client_source_id server-side; unresolvable topics stay null. */
  private attachSourceAttribution(topics: ResearchTopic[], index: SourceAttributionIndex): void {
    for (const topic of topics) {
      if (topic.source_url && index.byUrl.has(topic.source_url)) {
        topic.client_source_id = index.byUrl.get(topic.source_url) ?? null
      } else if (topic.source_type === 'file' && topic.source_title) {
        topic.client_source_id = index.byLabel.get(topic.source_title) ?? null
      } else if (topic.source_type === 'web_search') {
        topic.client_source_id = index.tavilySourceId
      } else {
        topic.client_source_id = null
      }
    }
  }
}

export async function performResearch(ctx: ResearchRunContext): Promise<ResearchTopic[]> {
  const pipeline = new ResearchPipeline(ctx)
  return pipeline.execute()
}
