import { parsePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { toCarouselSwipeCues, toFormalityRulesData, type LanguageConfig } from '@/lib/clients/language-rules'
import { fetchBrandProfileByClient, fetchLanguageRulesByLanguage, type LanguageRulesRow } from '@/lib/queries/db'
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

const DEFAULT_STRATEGY: SourceStrategy = { rss: true, website: true, file: true, trend_fallback: true }

const MAX_RESEARCH_RETRIES = 1

interface RawClientProfile {
  profile: {
    content_pillars: string | null
    source_strategy: SourceStrategy | null
    language_formality: string | null
    language_notes: string | null
  } | null
  langRules: LanguageRulesRow | null
}

interface ResearchClientData {
  contentPillars: WeightedPillar[]
  history: string[]
  sources: ClientSourceRow[]
  strategy: SourceStrategy
  languageConfig: LanguageConfig
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
    } = await this.generateAndFilter(requestedCount, builder, sourceContext, fullTextIndex)

    let topics = initialTopics

    // Retry loop — uses conversation history so source data is NOT re-sent
    for (let retry = 0; retry < MAX_RESEARCH_RETRIES && topics.length < requestedCount; retry++) {
      this.ctx.onPhase?.('Refining themes...')
      const deficit = requestedCount - topics.length
      const extendedHistory = [...clientData.history, ...topics.map((t: ResearchTopic) => t.suggested_theme)]
      builder.updateHistory(extendedHistory)

      const retryTopics = await builder.generateTopicsRetry(deficit, firstUserPrompt, firstRawResponse)
      this.attachSourceFullText(retryTopics, fullTextIndex)
      topics.push(...retryTopics)
    }

    if (topics.length < requestedCount) {
      console.warn(`[research] Only ${topics.length}/${requestedCount} themes generated after retry`)
    }

    const finalTopics = topics.slice(0, requestedCount)

    // Emit each final topic for streaming consumers (after all dedup/retry is done)
    for (const topic of finalTopics) {
      this.ctx.onTopic?.(topic)
    }

    return finalTopics
  }

  // ---- Private methods ----

  /** Load brand profile, post history, generation themes, and client sources. */
  private async loadClientData(): Promise<ResearchClientData> {
    const defaultLanguageConfig = this.buildDefaultLanguageConfig()

    if (!this.ctx.clientId) {
      return { contentPillars: [], history: [], sources: [], strategy: DEFAULT_STRATEGY, languageConfig: defaultLanguageConfig }
    }

    const owns = await this.verifyClientOwnership()
    if (!owns) {
      return { contentPillars: [], history: [], sources: [], strategy: DEFAULT_STRATEGY, languageConfig: defaultLanguageConfig }
    }

    const [profile, history, sources] = await Promise.all([
      this.fetchClientProfile(),
      this.fetchClientHistory(),
      this.fetchClientSources(),
    ])

    const languageConfig = this.buildLanguageConfig(profile, defaultLanguageConfig)
    const contentPillars = profile.profile?.content_pillars ? parsePillars(profile.profile.content_pillars) : []
    const strategy = profile.profile?.source_strategy
      ? { ...DEFAULT_STRATEGY, ...profile.profile.source_strategy }
      : DEFAULT_STRATEGY
    const filteredSources = this.filterSourcesByStrategy(sources, strategy)

    return { contentPillars, history, sources: filteredSources, strategy, languageConfig }
  }

  /** Returns the fallback LanguageConfig when no DB data is available. */
  private buildDefaultLanguageConfig(): LanguageConfig {
    return {
      language: this.ctx.language || 'English',
      formality: 'neutral',
      carouselSwipeCues: '',
      formalityRules: null,
      languageInstructions: '',
      languageNotes: '',
    }
  }

  /** Verify the client belongs to this agency. */
  private async verifyClientOwnership(): Promise<boolean> {
    const { data } = await this.ctx.supabase
      .from('clients')
      .select('id')
      .eq('id', this.ctx.clientId!)
      .eq('agency_id', this.ctx.agencyId)
      .single()
    return !!data
  }

  /** Fetch brand profile and language rules — skips DB when pre-loaded data is provided. */
  private async fetchClientProfile(): Promise<RawClientProfile> {
    // Use pre-loaded data from wizard if available — avoids 2 DB queries per run
    if (this.ctx.preloaded) {
      return {
        profile: {
          content_pillars:    this.ctx.preloaded.contentPillars,
          source_strategy:    this.ctx.preloaded.sourceStrategy,
          language_formality: this.ctx.preloaded.languageFormality,
          language_notes:     this.ctx.preloaded.languageNotes,
        },
        langRules: {
          native_cta_phrases:    null,
          formality_rules:       null,
          language_instructions: this.ctx.preloaded.languageInstructions,
        },
      }
    }

    // DB fallback — used by cron jobs and callers without pre-loaded data
    const language = this.ctx.language || 'English'
    const [profile, langRules] = await Promise.all([
      fetchBrandProfileByClient(this.ctx.supabase, this.ctx.clientId!),
      fetchLanguageRulesByLanguage(this.ctx.supabase, language),
    ])
    return {
      profile: profile as RawClientProfile['profile'],
      langRules: langRules as RawClientProfile['langRules'],
    }
  }

  /** Fetch post history + recently generated theme descriptions. */
  private async fetchClientHistory(): Promise<string[]> {
    if (this.ctx.preloaded?.postHistory) return this.ctx.preloaded.postHistory

    const [historyResult, themesResult] = await Promise.all([
      this.ctx.supabase
        .from('post_history')
        .select('topic_summary')
        .eq('client_id', this.ctx.clientId!)
        .order('created_at', { ascending: false })
        .limit(30),
      this.ctx.supabase
        .from('generation_runs')
        .select('generation_themes(theme_description)')
        .eq('client_id', this.ctx.clientId!)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const postTopics =
      (historyResult.data as Array<{ topic_summary: string | null }> | null)
        ?.map((h) => h.topic_summary)
        .filter((s): s is string => s !== null) ?? []

    const themeDescriptions: string[] = []
    const runsData = themesResult.data as Array<{ generation_themes: Array<{ theme_description: string | null }> }> | null
    if (runsData) {
      for (const run of runsData) {
        for (const theme of run.generation_themes) {
          if (theme.theme_description) themeDescriptions.push(theme.theme_description)
        }
      }
    }

    return [...postTopics, ...themeDescriptions]
  }

  /** Fetch active client sources. */
  private async fetchClientSources(): Promise<ClientSourceRow[]> {
    const { data } = await this.ctx.supabase
      .from('client_sources')
      .select('id, type, label, url, config, extracted_text')
      .eq('client_id', this.ctx.clientId!)
      .eq('is_active', true)
    return (data as ClientSourceRow[] | null) ?? []
  }

  /** Filter sources by the client's source strategy. */
  private filterSourcesByStrategy(sources: ClientSourceRow[], strategy: SourceStrategy): ClientSourceRow[] {
    return sources.filter((s) => {
      if (s.type === 'rss' && !strategy.rss) return false
      if (s.type === 'website' && !strategy.website) return false
      if (s.type === 'file' && !strategy.file) return false
      return true
    })
  }

  /** Build LanguageConfig from raw DB data. */
  private buildLanguageConfig(raw: RawClientProfile, defaults: LanguageConfig): LanguageConfig {
    const { profile, langRules } = raw
    return {
      language: defaults.language,
      formality: profile?.language_formality ?? 'neutral',
      carouselSwipeCues: toCarouselSwipeCues(langRules?.native_cta_phrases as never),
      formalityRules: toFormalityRulesData(langRules?.formality_rules as never),
      languageInstructions: langRules?.language_instructions ?? '',
      languageNotes: profile?.language_notes ?? '',
    }
  }

  /** Fetch all sources in parallel. Reports status to DB for network sources. */
  private async fetchAllSources(sources: ResearchSource[], limits: FetchLimits): Promise<void> {
    const networkSources = sources.filter((s) => s.isNetworkFetchable())
    const fileSources = sources.filter((s) => !s.isNetworkFetchable())

    await Promise.allSettled(
      networkSources.map(async (source) => {
        const result = await source.fetch(limits)
        source.reportStatus(this.ctx.supabase, result)
      })
    )

    // File sources: no-op fetch, no network call, no status report
    for (const source of fileSources) {
      await source.fetch()
    }
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
    const allRssItems = sources.flatMap((s) => s.getRssItems()).slice(0, limits.rssGlobalCap)

    // Check if RSS text fits budget (for determining if we have content)
    const rssText = allRssItems
      .map((item) => `- ${item.title}: ${item.description}${item.link ? ` (${item.link})` : ''}`)
      .join('\n')
      .slice(0, limits.rssBudget)
    const cappedRssItems = rssText.length > 0 ? allRssItems : []

    // Website: distribute scaled web budget across all excerpts from all sources
    const allWebExcerpts = sources.flatMap((s) => s.getWebExcerpts())
    const perWebBudget = allWebExcerpts.length > 0 ? Math.floor(limits.webBudget / allWebExcerpts.length) : 0
    const cappedWebExcerpts = allWebExcerpts
      .map((w) => ({ ...w, text: w.text.slice(0, perWebBudget) }))
      .filter((w) => w.text.length > 0)

    // File: distribute scaled file budget across sources with content
    const sourcesWithFiles = sources.filter((s) => s.hasFileContent())
    const perFileBudget = sourcesWithFiles.length > 0 ? Math.floor(limits.fileBudget / sourcesWithFiles.length) : 0
    const cappedFileExcerpts: FileExcerpt[] = sourcesWithFiles
      .map((s) => s.getFileExcerpt(perFileBudget))
      .filter((f): f is FileExcerpt => f !== null)

    if (cappedRssItems.length === 0 && cappedWebExcerpts.length === 0 && cappedFileExcerpts.length === 0) {
      if (!strategy.trend_fallback) {
        return { rssItems: [], websiteExcerpts: [], fileExcerpts: [] }
      }
      return undefined
    }

    return { rssItems: cappedRssItems, websiteExcerpts: cappedWebExcerpts, fileExcerpts: cappedFileExcerpts }
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

  /**
   * Generate topics and attach source full text.
   * Returns topics plus the raw prompt/response needed for retry conversation history.
   */
  private async generateAndFilter(
    count: number,
    builder: ResearchPromptBuilder,
    sourceContext: SourceContext | undefined,
    fullTextIndex: SourceFullTextIndex,
  ): Promise<{ topics: ResearchTopic[]; userPrompt: string; rawResponse: string }> {
    const { topics, userPrompt, rawResponse } = await builder.generateTopics(count, sourceContext)
    this.attachSourceFullText(topics, fullTextIndex)
    return { topics, userPrompt, rawResponse }
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

/**
 * Convenience function preserving the old API shape.
 * Route handlers can import this directly.
 */
export async function performResearch(ctx: ResearchRunContext): Promise<ResearchTopic[]> {
  const pipeline = new ResearchPipeline(ctx)
  return pipeline.execute()
}
