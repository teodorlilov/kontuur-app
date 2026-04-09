import { parsePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { toCarouselSwipeCues, toFormalityRulesData, type LanguageConfig } from '@/lib/clients/language-rules'
import type { Json } from '@/types/database'
import { createAllSources } from './sources/source-factory'
import { RssResearchSource } from './sources/rss-source'
import { WebsiteResearchSource } from './sources/website-source'
import { FileResearchSource } from './sources/file-source'
import { ResearchSource } from './sources/research-source'
import { Deduplicator } from './deduplicator'
import { ResearchPromptBuilder } from './prompts/prompt-builder'
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
  langRules: {
    native_cta_phrases: Json | null
    formality_rules: Json | null
    language_instructions: string | null
    opener_examples: Json | null
  } | null
}

interface ClientData {
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
    const dedup = new Deduplicator(this.ctx.language)

    // Initial generation
    let filteredTopics = await this.generateAndFilter(
      requestedCount, builder, sourceContext, clientData.history, fullTextIndex, dedup
    )

    // Optional LLM dedup pass (expensive — only runs once, not on retries)
    this.ctx.onPhase?.('Filtering for originality...')
    filteredTopics = await dedup.filterWithLLM(filteredTopics, clientData.history, this.ctx.language || 'English')

    // Retry loop — request deficit only
    for (let retry = 0; retry < MAX_RESEARCH_RETRIES && filteredTopics.length < requestedCount; retry++) {
      const extendedHistory = [...clientData.history, ...filteredTopics.map((t) => t.suggested_theme)]
      const deficit = requestedCount - filteredTopics.length

      builder.updateHistory(extendedHistory)
      const retryTopics = await this.generateAndFilter(
        deficit, builder, sourceContext, extendedHistory, fullTextIndex, dedup
      )
      filteredTopics.push(...retryTopics)
    }

    if (filteredTopics.length < requestedCount) {
      console.warn(`[research] Only ${filteredTopics.length}/${requestedCount} themes survived dedup after retry`)
    }

    const finalTopics = filteredTopics.slice(0, requestedCount)

    // Emit each final topic for streaming consumers (after all dedup/retry is done)
    for (const topic of finalTopics) {
      this.ctx.onTopic?.(topic)
    }

    return finalTopics
  }

  // ---- Private methods ----

  /** Load brand profile, post history, generation themes, and client sources. */
  private async loadClientData(): Promise<ClientData> {
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

  /** Fetch brand profile and language rules. */
  private async fetchClientProfile(): Promise<RawClientProfile> {
    const language = this.ctx.language || 'English'
    const [profileResult, langRulesResult] = await Promise.all([
      this.ctx.supabase
        .from('brand_profiles')
        .select('content_pillars, source_strategy, language_formality, language_notes')
        .eq('client_id', this.ctx.clientId!)
        .single(),
      this.ctx.supabase
        .from('language_rules')
        .select('native_cta_phrases, formality_rules, language_instructions, opener_examples')
        .eq('language', language)
        .single(),
    ])
    return {
      profile: profileResult.data as RawClientProfile['profile'],
      langRules: langRulesResult.data as RawClientProfile['langRules'],
    }
  }

  /** Fetch post history + recently generated theme descriptions. */
  private async fetchClientHistory(): Promise<string[]> {
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
      carouselSwipeCues: toCarouselSwipeCues(langRules?.native_cta_phrases),
      formalityRules: toFormalityRulesData(langRules?.formality_rules),
      languageInstructions: langRules?.language_instructions ?? '',
      languageNotes: profile?.language_notes ?? '',
    }
  }

  /** Fetch all sources in parallel. Reports status to DB for fetchable sources. */
  private async fetchAllSources(sources: ResearchSource[], limits: FetchLimits): Promise<void> {
    const fetchable = sources.filter((s) => !(s instanceof FileResearchSource))
    const files = sources.filter((s): s is FileResearchSource => s instanceof FileResearchSource)

    // Fetch network sources in parallel (limits control items/pages per source)
    await Promise.allSettled(
      fetchable.map(async (source) => {
        const result = await source.fetch(limits)
        source.reportStatus(this.ctx.supabase, result)
      })
    )

    // File sources: call fetch() (no-op, but consistent)
    for (const file of files) {
      await file.fetch()
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
    const rssSources = sources.filter((s): s is RssResearchSource => s instanceof RssResearchSource)
    const webSources = sources.filter((s): s is WebsiteResearchSource => s instanceof WebsiteResearchSource)
    const fileSources = sources.filter((s): s is FileResearchSource => s instanceof FileResearchSource)

    // RSS: aggregate all items, cap at scaled global limit
    const allRssItems = rssSources.flatMap((s) => s.getItems()).slice(0, limits.rssGlobalCap)

    // Check if RSS text fits budget (for determining if we have content)
    const rssText = allRssItems
      .map((item) => `- ${item.title}: ${item.description}${item.link ? ` (${item.link})` : ''}`)
      .join('\n')
      .slice(0, limits.rssBudget)
    const cappedRssItems = rssText.length > 0 ? allRssItems : []

    // Website: distribute scaled web budget across all excerpts from all sources
    const allWebExcerpts = webSources.flatMap((s) => s.getRawExcerpts())
    const perWebBudget = allWebExcerpts.length > 0 ? Math.floor(limits.webBudget / allWebExcerpts.length) : 0
    const cappedWebExcerpts = allWebExcerpts
      .map((w) => ({ ...w, text: w.text.slice(0, perWebBudget) }))
      .filter((w) => w.text.length > 0)

    // File: distribute scaled file budget across all file sources with content
    const fileSourcesWithContent = fileSources.filter((s) => s.hasContent())
    const perFileBudget = fileSourcesWithContent.length > 0 ? Math.floor(limits.fileBudget / fileSourcesWithContent.length) : 0
    const cappedFileExcerpts: FileExcerpt[] = fileSourcesWithContent
      .map((s) => s.getCappedExcerpt(perFileBudget))
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
      const entries = source.getFullTextEntries(SOURCE_FULL_TEXT_CAP)
      const targetMap = source instanceof FileResearchSource ? byLabel : byUrl
      for (const [key, value] of entries) {
        targetMap.set(key, value)
      }
    }

    return { byUrl, byLabel }
  }

  /**
   * Generate topics, attach source full text, then run algorithmic dedup.
   * Used by both the initial run and the retry loop.
   */
  private async generateAndFilter(
    count: number,
    builder: ResearchPromptBuilder,
    sourceContext: SourceContext | undefined,
    history: string[],
    fullTextIndex: SourceFullTextIndex,
    dedup: Deduplicator,
  ): Promise<ResearchTopic[]> {
    const topics = await builder.generateTopics(count, sourceContext)
    this.attachSourceFullText(topics, fullTextIndex)
    return dedup.filterConflicts(topics, history)
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
