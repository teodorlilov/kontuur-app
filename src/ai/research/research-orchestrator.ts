import { fetchClientSources, fetchThemeDescriptions } from '@/lib/queries/db'
import { createAllSources } from './sources/source-factory'
import { ResearchSource } from './sources/research-source'
import { ResearchPromptBuilder } from './prompt-builder'
import { computeFetchLimits, SOURCE_FULL_TEXT_CAP } from './fetch-limits'
import type {
  ResearchRunContext,
  ResearchTopic,
  SourceContext,
  ClientSourceRow,
  FetchLimits,
  SourceFullTextIndex,
  SourceStrategy,
  FileExcerpt,
} from './types'
import type { ClientData } from '@/lib/clients/fetch-client-data'

const DEFAULT_STRATEGY: SourceStrategy = {
  rss: true,
  website: true,
  file: true,
  trend_fallback: true,
}
const MAX_RESEARCH_RETRIES = 1

interface ResearchClientData extends ClientData {
  sources: ClientSourceRow[]
  history: string[]
  strategy: SourceStrategy
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
    // 1. Load client data (pillars, history, sources, strategy)
    this.ctx.onPhase?.('Loading brand profile...')
    const clientData = await this.loadClientData()

    // 2. Compute fetch limits scaled to requested post count
    // 3. Create source objects via factory (polymorphic creation)
    // 4. Fetch all sources in parallel (limits control how much each source fetches)
    this.ctx.onPhase?.('Fetching sources...')
    const limits = computeFetchLimits(this.ctx.count)
    const sourceObjects = createAllSources(clientData.sources)
    await this.fetchAllSources(sourceObjects, limits)

    // 5. Build source context from fetched sources (limits control token budgets)
    const sourceContext = this.buildSourceContext(sourceObjects, clientData.strategy, limits)

    // 6. Build full-text maps for source grounding
    const fullTextIndex = this.buildSourceFullTextIndex(sourceObjects)

    // 7. Generate topics via prompt builder (exact count, no multiplier)
    this.ctx.onPhase?.('Generating theme ideas...')
    const builder = new ResearchPromptBuilder({
      niche: this.ctx.niche,
      languageConfig: clientData.languageConfig,
      contentPillars: clientData.contentPillars,
      postHistory: clientData.history,
    })

    const requestedCount = this.ctx.count

    // Initial generation — exact count, trust the LLM + exclusion list
    const {
      topics: initialTopics,
      userPrompt: firstUserPrompt,
      rawResponse: firstRawResponse,
    } = await builder.generateTopics(requestedCount, sourceContext)
    this.attachSourceFullText(initialTopics, fullTextIndex)

    let topics = initialTopics

    // Retry loop — uses conversation history so source data is NOT re-sent
    for (let retry = 0; retry < MAX_RESEARCH_RETRIES && topics.length < requestedCount; retry++) {
      this.ctx.onPhase?.('Refining themes...')
      const deficit = requestedCount - topics.length
      const extendedHistory = [
        ...clientData.history,
        ...topics.map((t: ResearchTopic) => t.suggested_theme),
      ]
      builder.updateHistory(extendedHistory)

      try {
        const retryTopics = await builder.generateTopicsRetry(
          deficit,
          firstUserPrompt,
          firstRawResponse
        )
        this.attachSourceFullText(retryTopics, fullTextIndex)
        topics.push(...retryTopics)
      } catch (err) {
        console.error(
          `[research] Retry ${retry + 1} failed — keeping ${topics.length} topics already generated`,
          err
        )
        break
      }
    }

    if (topics.length < requestedCount) {
      console.warn(
        `[research] Only ${topics.length}/${requestedCount} themes generated after retry`
      )
    }

    const finalTopics = topics.slice(0, requestedCount)

    // Emit each final topic for streaming consumers (after all dedup/retry is done)
    for (const topic of finalTopics) {
      this.ctx.onTopic?.(topic)
    }

    return finalTopics
  }

  /** Load brand profile, post history, generation themes, and client sources. */
  private async loadClientData(): Promise<ResearchClientData> {
    // Preloaded path — wizard always passes ClientData with full context
    if (this.ctx.preloadedClientData) {
      const data: ClientData = this.ctx.preloadedClientData
      const strategy: SourceStrategy = data.sourceStrategy ?? DEFAULT_STRATEGY
      const sources = this.ctx.clientId
        ? await fetchClientSources(this.ctx.supabase, this.ctx.clientId)
        : []
      const themeHistory = this.ctx.clientId
        ? await fetchThemeDescriptions(this.ctx.supabase, this.ctx.clientId)
        : []
      return {
        ...data,
        sources,
        history: [...data.postHistory, ...themeHistory],
        strategy,
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
        await source.reportStatus(this.ctx.supabase, result)
      })
    )

    // File sources: no-op fetch, no network call, no status report
    await Promise.all(fileSources.map((source) => source.fetch()))
  }

  /**
   * Build the SourceContext from fetched source objects.
   * Aggregates RSS items (global cap), budgets website/file excerpts.
   */
  private buildSourceContext(
    sources: ResearchSource[],
    strategy: SourceStrategy,
    limits: FetchLimits
  ): SourceContext | undefined {
    // RSS: aggregate all items across sources, cap at scaled global limit
    const cappedRssItems = sources.flatMap((s) => s.getRssItems()).slice(0, limits.rssGlobalCap)

    // Website: distribute scaled web budget across all excerpts from all sources
    const allWebExcerpts = sources.flatMap((s) => s.getWebExcerpts())
    const perWebBudget =
      allWebExcerpts.length > 0 ? Math.floor(limits.webBudget / allWebExcerpts.length) : 0
    const cappedWebExcerpts = allWebExcerpts
      .map((w) => ({ ...w, text: w.text.slice(0, perWebBudget) }))
      .filter((w) => w.text.length > 0)

    // File: distribute scaled file budget across sources with content
    const sourcesWithFiles = sources.filter((s) => s.hasFileContent())
    const perFileBudget =
      sourcesWithFiles.length > 0 ? Math.floor(limits.fileBudget / sourcesWithFiles.length) : 0
    const cappedFileExcerpts: FileExcerpt[] = sourcesWithFiles
      .map((s) => s.getFileExcerpt(perFileBudget))
      .filter((f): f is FileExcerpt => f !== null)

    if (
      cappedRssItems.length === 0 &&
      cappedWebExcerpts.length === 0 &&
      cappedFileExcerpts.length === 0
    ) {
      if (!strategy.trend_fallback) {
        return { rssItems: [], websiteExcerpts: [], fileExcerpts: [] }
      }
      return undefined
    }

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
