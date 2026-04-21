import { fetchClientSources, fetchThemeDescriptions, fetchUsedSourceUrls } from '@/lib/queries/db'
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
import { ResearchPromptBuilder } from './prompts/prompt-builder'
import { generateTopics } from './generators/topic-generator'
import { computeFetchLimits, SOURCE_FULL_TEXT_CAP } from './fetch-limits'
import type {
  ResearchRunContext,
  ResearchTopic,
  SourceContext,
  ClientSourceRow,
  FetchLimits,
  SourceFullTextIndex,
  SkippedPillar,
  FileExcerpt,
} from './types'
import type { ClientData } from '@/lib/clients/fetch-client-data'

interface ResearchClientData extends ClientData {
  sources: ClientSourceRow[]
  history: string[]
  usedUrls: string[]
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

    // Skip pillars with no eligible sources
    const allSourcePillarIds = [
      ...sourceObjects.map((s) => getSourcePillarIds(s.pillarIds)),
      ...(tavilyRow ? [getSourcePillarIds(tavilyRow.pillar_ids)] : []),
    ]
    const effectivePillars = pillars.filter((p) => pillarHasSources(p.id, allSourcePillarIds))
    const preSkippedPillars: SkippedPillar[] = pillars
      .filter((p) => !pillarHasSources(p.id, allSourcePillarIds))
      .map((p) => ({ name: p.pillar }))

    const [, allWebSearchItems] = await Promise.all([
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
    ])

    // Tag web search items with tavily source's eligible pillars
    const tavilyPillarNames = tavilyRow
      ? resolvePillarNames(getSourcePillarIds(tavilyRow.pillar_ids), pillars)
      : []
    const webSearchItems = shouldSearchWeb
      ? tavilyPillarNames.length > 0
        ? allWebSearchItems.map((r) => ({ ...r, eligiblePillars: tavilyPillarNames }))
        : allWebSearchItems
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

    const effectiveContext: SourceContext = {
      ...clientSourceContext,
      webSearchItems: webSearchItems.length > 0 ? webSearchItems : undefined,
    }

    this.ctx.onPhase?.('Generating theme ideas...')
    const builder = new ResearchPromptBuilder({
      niche: this.ctx.niche,
      languageConfig: clientData.languageConfig,
      contentPillars: effectivePillars,
      postHistory: clientData.history,
      excludedUrls: clientData.usedUrls,
    })

    const topics = await generateTopics(builder, requestedCount, effectiveContext)

    // Filter LLM-hallucinated topics (no source URL except file type)
    const groundedTopics = topics.filter(
      (t) => t.suggested_theme?.trim() && (t.source_url || t.source_type === 'file')
    )

    // Detect skipped pillars (pillars with no returned topics — includes pre-skipped + post-LLM)
    const coveredPillars = new Set(groundedTopics.map((t) => t.pillar).filter(Boolean))
    const postLlmSkipped: SkippedPillar[] = effectivePillars
      .filter((p) => !coveredPillars.has(p.pillar))
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
    const finalTopics = groundedTopics.slice(0, requestedCount)
    for (const topic of finalTopics) this.ctx.onTopic?.(topic)
    return finalTopics
  }

  /** Load brand profile, post history, generation themes, and client sources. */
  private async loadClientData(): Promise<ResearchClientData> {
    // Preloaded path — wizard always passes ClientData with full context
    if (this.ctx.preloadedClientData) {
      const data: ClientData = this.ctx.preloadedClientData
      const [sources, themeHistory, usedUrls] = await Promise.all([
        this.ctx.clientId
          ? fetchClientSources(this.ctx.supabase, this.ctx.clientId)
          : Promise.resolve([]),
        this.ctx.clientId
          ? fetchThemeDescriptions(this.ctx.supabase, this.ctx.clientId)
          : Promise.resolve([]),
        this.ctx.clientId
          ? fetchUsedSourceUrls(this.ctx.supabase, this.ctx.clientId)
          : Promise.resolve([]),
      ])

      return {
        ...data,
        sources,
        history: [...data.postHistory, ...themeHistory],
        usedUrls,
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
    // RSS: aggregate all items across sources, tag with eligible pillars, cap at global limit
    const cappedRssItems = sources
      .flatMap((s) => {
        const names = pillarNamesById.get(s.id) ?? []
        return s.getRssItems().map((item) =>
          names.length > 0 ? { ...item, eligiblePillars: names } : item
        )
      })
      .slice(0, limits.rssGlobalCap)

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
}

export async function performResearch(ctx: ResearchRunContext): Promise<ResearchTopic[]> {
  const pipeline = new ResearchPipeline(ctx)
  return pipeline.execute()
}
