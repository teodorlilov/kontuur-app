import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
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
  computePillarCoverage,
  getSourcePillarIds,
  resolvePillarNames,
  type WeightedPillar,
} from '@/lib/clients/content-pillars'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { interleaveRoundRobin } from '@/utils/interleave'
import type { TavilyConfig } from '@/types/sources'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import { createAllSources } from './sources/source-factory'
import { ResearchSource } from './sources/research-source'
import { fetchPerformanceItems } from './performance-source'
import { SOURCE_FULL_TEXT_CAP } from './fetch-limits'
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

/**
 * Stage A of generation: assemble the material a run can draw on.
 *
 * Split out of `ResearchPipeline` because gathering is shared by two callers with
 * different needs — a researched batch wants every source kind, while a run built
 * from user-supplied briefs wants the client's own material plus a focused search
 * and has no use for an RSS recency stream. Gathering decides nothing; it only
 * fetches and orders. Every "what is this post about" judgement lives in stage C.
 */

/** The non-web source kinds a run can draw on. */
export type ResearchSourceKind = 'rss' | 'website' | 'file'

/** Unexported: the default when a caller names no kinds. Only `gatherSources` reads it. */
const ALL_SOURCE_KINDS: readonly ResearchSourceKind[] = ['rss', 'website', 'file']

interface ResearchClientData extends ClientData {
  sources: ClientSourceRow[]
  history: string[]
  usedUrls: string[]
  sourceStats: SourceUsageStats[]
  recentPillarCounts: Map<string, number>
}

interface GatherOptions {
  limits: FetchLimits
  /** Which non-web source rows to build. Defaults to all. */
  sourceKinds?: readonly ResearchSourceKind[]
  /** How many web results to aim for. */
  webResultCount: number
  /**
   * User-supplied subjects to search for by name, alongside the niche queries.
   * Without them a brief is searched for as though it were the client's niche.
   */
  focusTexts?: readonly string[]
  /**
   * Whether to fetch the client's top Instagram posts. Defaults to true; a
   * briefs-only run turns it off — performance is a style signal for choosing
   * topics, not grounding for a topic the client already supplied.
   */
  includePerformance?: boolean
}

interface GatheredSources {
  clientData: ResearchClientData
  context: SourceContext
  /**
   * Whether anything at all was gathered. False means the run proceeds ungrounded —
   * an error for a researched batch, normal for a run built from briefs.
   */
  hasAnySources: boolean
  /** Pillars still in play — coverage-state 'none' pillars are pre-skipped out. */
  effectivePillars: WeightedPillar[]
  preSkippedPillars: SkippedPillar[]
  fullTextIndex: SourceFullTextIndex
  attributionIndex: SourceAttributionIndex
}

/** Fetch and assemble every source this run may draw on. */
export async function gatherSources(
  ctx: ResearchRunContext,
  opts: GatherOptions
): Promise<GatheredSources> {
  const { limits, webResultCount } = opts
  const sourceKinds = opts.sourceKinds ?? ALL_SOURCE_KINDS

  ctx.onPhase?.('Loading brand profile...', 'gathering')
  const clientData = await loadClientData(ctx)
  const pillars = clientData.contentPillars

  ctx.onPhase?.('Fetching sources...', 'gathering')

  // The tavily row is not a ResearchSource — it drives searchTrends, and it is the
  // attribution anchor every web_search topic resolves to.
  const tavilyRow = clientData.sources.find((r) => r.type === 'tavily')
  const requestedSources = clientData.sources.filter(
    (r) => r.type !== 'tavily' && sourceKinds.includes(r.type as ResearchSourceKind)
  )
  const sourceObjects = createAllSources(requestedSources)

  // Pre-cache pillar names per source to avoid redundant resolution in buildSourceContext
  const pillarNamesById = new Map<string, string[]>()
  for (const s of sourceObjects) {
    pillarNamesById.set(s.id, resolvePillarNames(getSourcePillarIds(s.pillarIds), pillars))
  }

  const shouldSearchWeb = !!tavilyRow
  const tavilyConfig = (tavilyRow?.config ?? {}) as TavilyConfig

  // Pre-skip pillars nothing can serve. Web research is soft coverage — the
  // pillar stays in the run and the search decides — but only within the tavily
  // row's own topic limit: a pillar limited away from it with no content source
  // used to be asked for and dropped every run. Coverage reads requestedSources,
  // not all sources, because a run that excludes a source kind cannot draw on it.
  const coverage = computePillarCoverage(pillars, [
    ...requestedSources,
    ...(tavilyRow ? [tavilyRow] : []),
  ])
  const effectivePillars = pillars.filter((p) => coverage.get(p.id)?.state !== 'none')
  const preSkippedPillars: SkippedPillar[] = pillars
    .filter((p) => coverage.get(p.id)?.state === 'none')
    .map((p) => ({ name: p.pillar }))

  const [, allWebSearchItems, performanceItems] = await Promise.all([
    fetchAllSources(ctx.supabase, sourceObjects, limits),
    shouldSearchWeb
      ? searchTrends(ctx.niche, webResultCount, {
          targetAudience: clientData.targetAudience,
          contentPillars: effectivePillars,
          postHistory: clientData.history,
          language: clientData.language,
          excludedUrls: clientData.usedUrls,
          tavilyConfig,
          focusTexts: opts.focusTexts ? [...opts.focusTexts] : undefined,
        })
      : Promise.resolve([]),
    opts.includePerformance !== false && ctx.clientId
      ? fetchPerformanceItems(ctx.supabase, ctx.clientId)
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

  const clientSourceContext = buildSourceContext(sourceObjects, limits, pillarNamesById)

  // performanceItems counts: a client whose only working signal is their own top
  // Instagram posts used to get "No source material found" and a zero-post run,
  // even though the items had been fetched and the prompt, sourcing rules and
  // grounding whitelist all already handle a performance-only run.
  const hasAnySources =
    clientSourceContext.rssItems.length > 0 ||
    clientSourceContext.websiteExcerpts.length > 0 ||
    clientSourceContext.fileExcerpts.length > 0 ||
    webSearchItems.length > 0 ||
    performanceItems.length > 0

  // Visible proof the performance source fired — streams to the wizard's loading UI.
  // Gated on hasAnySources because the caller bails before this point when nothing
  // was gathered, and announcing an analysis that is about to be abandoned would be
  // a phase message the run never acts on.
  if (hasAnySources && performanceItems.length > 0) {
    ctx.onPhase?.(`Analyzing ${performanceItems.length} top Instagram posts...`, 'gathering')
  }

  return {
    clientData,
    context: {
      ...clientSourceContext,
      webSearchItems: webSearchItems.length > 0 ? webSearchItems : undefined,
      performanceItems: performanceItems.length > 0 ? performanceItems : undefined,
    },
    hasAnySources,
    effectivePillars,
    preSkippedPillars,
    fullTextIndex: buildSourceFullTextIndex(sourceObjects),
    attributionIndex: buildSourceAttributionIndex(sourceObjects, tavilyRow ?? null),
  }
}

/** Attach full source text to topics based on their source metadata. */
export function attachSourceFullText(topics: ResearchTopic[], index: SourceFullTextIndex): void {
  for (const topic of topics) {
    if (topic.source_url && index.byUrl.has(topic.source_url)) {
      topic.source_full_text = index.byUrl.get(topic.source_url)
    } else if (topic.source_type === 'file' && topic.source_title) {
      topic.source_full_text = index.byLabel.get(topic.source_title)
    }
  }
}

/** Resolve each topic's client_source_id server-side; unresolvable topics stay null. */
export function attachSourceAttribution(
  topics: ResearchTopic[],
  index: SourceAttributionIndex
): void {
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

// ---- internals ----

/** Load brand profile, post history, generation themes, and client sources. */
async function loadClientData(ctx: ResearchRunContext): Promise<ResearchClientData> {
  // Preloaded path — wizard always passes ClientData with full context
  if (!ctx.preloadedClientData) throw new Error('[research] No preloaded client data')
  const data: ClientData = ctx.preloadedClientData

  const [sources, themeHistory, usedUrls, sourceStats, recentPillarCounts] = await Promise.all([
    ctx.clientId ? fetchClientSources(ctx.supabase, ctx.clientId) : Promise.resolve([]),
    ctx.clientId ? fetchThemeDescriptions(ctx.supabase, ctx.clientId) : Promise.resolve([]),
    ctx.clientId ? fetchUsedSourceUrls(ctx.supabase, ctx.clientId) : Promise.resolve([]),
    ctx.clientId
      ? // discarded_drafts is RLS-locked with no policies (admin-only); the
        // user-scoped client would read zero discards, so stats go through
        // the admin client — ownership is already verified by the caller.
        fetchSourceUsageStats(createAdminSupabaseClient(), ctx.clientId).catch((err) => {
          // Learn-loop input is optional — never block research on it
          console.warn('[research] source usage stats unavailable:', err)
          return []
        })
      : Promise.resolve([]),
    ctx.clientId
      ? fetchRecentPillarCounts(ctx.supabase, ctx.clientId).catch((err) => {
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

/** Fetch all sources in parallel. Reports status to DB for network sources. */
async function fetchAllSources(
  supabase: SupabaseClient,
  sources: ResearchSource[],
  limits: FetchLimits
): Promise<void> {
  const networkSources = sources.filter((s) => s.isNetworkFetchable())
  const fileSources = sources.filter((s) => !s.isNetworkFetchable())

  await Promise.allSettled(
    networkSources.map(async (source) => {
      const result = await source.fetch(limits)
      void source.reportStatus(supabase, result).catch((err: unknown) => {
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
function buildSourceContext(
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
    return s.getWebExcerpts().map((w) => (names.length > 0 ? { ...w, eligiblePillars: names } : w))
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
function buildSourceFullTextIndex(sources: ResearchSource[]): SourceFullTextIndex {
  const byUrl = new Map<string, string>()
  const byLabel = new Map<string, string>()

  for (const source of sources) {
    source.addToFullTextIndex(byUrl, byLabel, SOURCE_FULL_TEXT_CAP)
  }

  return { byUrl, byLabel }
}

/** Build url/label → client_sources id maps for outcome attribution. */
function buildSourceAttributionIndex(
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
