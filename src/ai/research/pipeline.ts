import { parsePillars, type WeightedPillar } from '@/lib/clients/content-pillars'
import { toCTAPhrases, toCarouselSwipeCues, toFormalityRulesData, toOpenerExamples, type LanguageConfig } from '@/lib/clients/language-rules'
import type { Json } from '@/types/database'
import { SourceFactory } from './sources/source-factory'
import { RssResearchSource } from './sources/rss-source'
import { WebsiteResearchSource } from './sources/website-source'
import { FileResearchSource } from './sources/file-source'
import { ResearchSource } from './sources/research-source'
import { Deduplicator } from './deduplicator'
import { ResearchPromptBuilder } from './prompts/prompt-builder'
import { computeFetchLimits } from './fetch-limits'
import type {
  ResearchContext,
  ResearchTopic,
  SourceContext,
  ClientSourceRow,
  FetchLimits,
  FullTextMaps,
  SourceStrategy,
  FileExcerpt,
} from './types'

const DEFAULT_STRATEGY: SourceStrategy = { rss: true, website: true, file: true, trend_fallback: true }

const SOURCE_FULL_TEXT_CAP = 4000

const MAX_RESEARCH_RETRIES = 1

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
  private readonly ctx: ResearchContext

  constructor(ctx: ResearchContext) {
    this.ctx = ctx
  } 

  /** Execute the full research pipeline. Main entry point. */
  async execute(): Promise<ResearchTopic[]> {
    // 1. Load client data (pillars, history, sources, strategy)
    const clientData = await this.loadClientData()

    // 2. Compute fetch limits scaled to requested post count
    const limits = computeFetchLimits(this.ctx.count)
    console.log('[research] fetch limits:', limits)

    // 3. Create source objects via factory (polymorphic creation)
    const sourceObjects = SourceFactory.createAll(clientData.sources)

    // 4. Fetch all sources in parallel (limits control how much each source fetches)
    await this.fetchAllSources(sourceObjects, limits)

    // 5. Build source context from fetched sources (limits control token budgets)
    const sourceContext = this.buildSourceContext(sourceObjects, clientData.strategy, limits)

    // 6. Build full-text maps for source grounding
    const fullTextMaps = this.buildFullTextMaps(sourceObjects)

    // 7. Generate topics via prompt builder (exact count, no multiplier)
    const builder = new ResearchPromptBuilder({
      niche: this.ctx.niche,
      languageConfig: clientData.languageConfig,
      contentPillars: clientData.contentPillars,
      postHistory: clientData.history,
    })

    const requestedCount = this.ctx.count
    const topics = await builder.generateTopics(requestedCount, sourceContext)

    // 8. Attach source full text for downstream grounding
    this.attachSourceFullText(topics, fullTextMaps)

    // 9. Dedup (algorithmic + optional LLM)
    const dedup = new Deduplicator(this.ctx.language)
    let filteredTopics = dedup.filterConflicts(topics, clientData.history)
    filteredTopics = await dedup.filterWithLLM(filteredTopics, clientData.history, this.ctx.language || 'English')

    // 10. Retry loop — request exact deficit, no multiplier
    for (let retry = 0; retry < MAX_RESEARCH_RETRIES && filteredTopics.length < requestedCount; retry++) {
      const extendedHistory = [...clientData.history, ...filteredTopics.map((t) => t.suggested_theme)]
      const deficit = requestedCount - filteredTopics.length

      builder.updateHistory(extendedHistory)
      const retryTopics = await builder.generateTopics(deficit, sourceContext)
      this.attachSourceFullText(retryTopics, fullTextMaps)

      const retryFiltered = dedup.filterConflicts(retryTopics, extendedHistory)
      filteredTopics.push(...retryFiltered)
    }

    if (filteredTopics.length < requestedCount) {
      console.warn(`[research] Only ${filteredTopics.length}/${requestedCount} themes survived dedup after retry`)
    }

    return filteredTopics.slice(0, requestedCount)
  }

  // ---- Private methods ----

  /**
   * Load brand profile, post history, generation themes, and client sources.
   * Validates client ownership via agency_id.
   */
  private async loadClientData(): Promise<ClientData> {
    const language = this.ctx.language || 'English'
    const defaultLanguageConfig: LanguageConfig = {
      language,
      formality: 'neutral',
      nativeCTAPhrases: '',
      carouselSwipeCues: '',
      formalityRules: null,
      languageInstructions: '',
      openerExamples: [],
      languageNotes: '',
    }
    let contentPillars: WeightedPillar[] = []
    let history: string[] = []
    let sources: ClientSourceRow[] = []
    let strategy: SourceStrategy = DEFAULT_STRATEGY

    if (!this.ctx.clientId) {
      return { contentPillars, history, sources, strategy, languageConfig: defaultLanguageConfig }
    }

    const { data: rawClient } = await this.ctx.supabase
      .from('clients')
      .select('id')
      .eq('id', this.ctx.clientId)
      .eq('agency_id', this.ctx.agencyId)
      .single()

    if (!rawClient) {
      return { contentPillars, history, sources, strategy, languageConfig: defaultLanguageConfig }
    }

    const [profileResult, langRulesResult, historyResult, themesResult, sourcesResult] = await Promise.all([
      this.ctx.supabase
        .from('brand_profiles')
        .select('content_pillars, source_strategy, language_formality, language_notes')
        .eq('client_id', this.ctx.clientId)
        .single(),
      this.ctx.supabase
        .from('language_rules')
        .select('native_cta_phrases, formality_rules, language_instructions, opener_examples')
        .eq('language', language)
        .single(),
      this.ctx.supabase
        .from('post_history')
        .select('topic_summary')
        .eq('client_id', this.ctx.clientId)
        .order('created_at', { ascending: false })
        .limit(30),
      this.ctx.supabase
        .from('generation_runs')
        .select('generation_themes(theme_description)')
        .eq('client_id', this.ctx.clientId)
        .order('created_at', { ascending: false })
        .limit(10),
      this.ctx.supabase
        .from('client_sources')
        .select('id, type, label, url, config, extracted_text')
        .eq('client_id', this.ctx.clientId)
        .eq('is_active', true),
    ])

    const profile = profileResult.data as {
      content_pillars: string | null
      source_strategy: SourceStrategy | null
      language_formality: string | null
      language_notes: string | null
    } | null
    if (profile?.content_pillars) {
      contentPillars = parsePillars(profile.content_pillars)
    }
    if (profile?.source_strategy) {
      strategy = { ...DEFAULT_STRATEGY, ...profile.source_strategy }
    }

    const langRules = langRulesResult.data as {
      native_cta_phrases: Json | null
      formality_rules: Json | null
      language_instructions: string | null
      opener_examples: Json | null
    } | null

    const languageConfig: LanguageConfig = {
      language,
      formality: profile?.language_formality ?? 'neutral',
      nativeCTAPhrases: toCTAPhrases(langRules?.native_cta_phrases),
      carouselSwipeCues: toCarouselSwipeCues(langRules?.native_cta_phrases),
      formalityRules: toFormalityRulesData(langRules?.formality_rules),
      languageInstructions: langRules?.language_instructions ?? '',
      openerExamples: toOpenerExamples(langRules?.opener_examples),
      languageNotes: profile?.language_notes ?? '',
    }

    const postHistoryTopics =
      (historyResult.data as Array<{ topic_summary: string | null }> | null)
        ?.map((h) => h.topic_summary)
        .filter((s): s is string => s !== null) ?? []

    const generatedThemeDescriptions: string[] = []
    const runsData = themesResult.data as Array<{ generation_themes: Array<{ theme_description: string | null }> }> | null
    if (runsData) {
      for (const run of runsData) {
        for (const theme of run.generation_themes) {
          if (theme.theme_description) {
            generatedThemeDescriptions.push(theme.theme_description)
          }
        }
      }
    }

    history = [...postHistoryTopics, ...generatedThemeDescriptions]

    const allSources = (sourcesResult.data as ClientSourceRow[] | null) ?? []
    sources = allSources.filter((s) => {
      if (s.type === 'rss' && !strategy.rss) return false
      if (s.type === 'website' && !strategy.website) return false
      if (s.type === 'file' && !strategy.file) return false
      return true
    })

    return { contentPillars, history, sources, strategy, languageConfig }
  }

  /** Fetch all sources in parallel. Reports status to DB for fetchable sources. */
  private async fetchAllSources(sources: ResearchSource[], limits: FetchLimits): Promise<void> {
    const fetchable = sources.filter((s) => !(s instanceof FileResearchSource))
    const files = sources.filter((s): s is FileResearchSource => s instanceof FileResearchSource)

    // Fetch network sources in parallel (limits control items/pages per source)
    await Promise.allSettled(
      fetchable.map(async (source) => {
        const result = await source.fetch({ limits })
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

  /** Build full-text maps from source objects for source grounding. */
  private buildFullTextMaps(sources: ResearchSource[]): FullTextMaps {
    const sourceFullTextMap = new Map<string, string>()
    const fileFullTextMap = new Map<string, string>()

    for (const source of sources) {
      const entries = source.getFullTextEntries(SOURCE_FULL_TEXT_CAP)
      const targetMap = source instanceof FileResearchSource ? fileFullTextMap : sourceFullTextMap
      for (const [key, value] of entries) {
        targetMap.set(key, value)
      }
    }

    return { sourceFullTextMap, fileFullTextMap }
  }

  /** Attach full source text to topics based on their source metadata. */
  private attachSourceFullText(topics: ResearchTopic[], maps: FullTextMaps): void {
    for (const topic of topics) {
      if (topic.source_url && maps.sourceFullTextMap.has(topic.source_url)) {
        topic.source_full_text = maps.sourceFullTextMap.get(topic.source_url)
      } else if (topic.source_type === 'file' && topic.source_title) {
        topic.source_full_text = maps.fileFullTextMap.get(topic.source_title)
      }
    }
  }
}

/**
 * Convenience function preserving the old API shape.
 * Route handlers can import this directly.
 */
export async function performResearch(ctx: ResearchContext): Promise<ResearchTopic[]> {
  const pipeline = new ResearchPipeline(ctx)
  return pipeline.execute()
}
