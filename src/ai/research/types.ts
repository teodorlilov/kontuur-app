import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientData } from '@/lib/clients/fetch-client-data'

export type { RssItem } from '@/lib/sources/fetch-rss'
export type { WeightedPillar } from '@/lib/clients/content-pillars'
export type { TrendSearchResult } from '@/lib/sources/fetch-trend-search'

/**
 * Which half of research a phase message came from.
 *
 * Research names its own work; the route maps these onto the progress rail's
 * stages. Reporting a rail *index* from here would put UI vocabulary inside the
 * pipeline, and inferring one from the message prose is the bug this replaces.
 */
export type ResearchPhase = 'gathering' | 'planning'

export interface ResearchTopic {
  finding: string
  suggested_theme: string
  pillar?: string
  source_url?: string | null
  source_title?: string | null
  source_type?: 'rss' | 'website' | 'file' | 'web_search' | 'performance' | null
  source_excerpt?: string
  /** Full source text attached after LLM research, from the fetched source map. Not LLM-generated. */
  source_full_text?: string
  /** client_sources row that produced this topic — attached server-side, never LLM-generated. */
  client_source_id?: string | null
  /**
   * 1-based index of the brief this topic serves, or null when the model chose the
   * topic itself. Planning briefs and researched topics in one call is what lets the
   * model avoid giving the same source to both, so the mapping back has to be explicit.
   */
  brief_index?: number | null
}

/**
 * A topic the user supplied rather than one research chose — a client idea or a
 * wizard priority brief. Stage C finds it a source and writes it a clean theme;
 * it is never assigned a pillar, because an ad-hoc post is not a rotation slot.
 */
export interface TopicBrief {
  /** What the user asked for, verbatim. */
  text: string
}

/** One of the client's own top-performing recent posts — audience-proven material for follow-up angles. */
export interface PerformanceItem {
  caption: string
  /** Recovered via posts.ig_media_id join; absent for organic posts Postflow didn't publish. */
  pillar?: string
  engagementSummary: string
  permalink?: string
}

export interface WebsiteExcerpt {
  url: string
  text: string
  focusInstructions?: string
  eligiblePillars?: string[]
}

export interface FileExcerpt {
  label: string
  text: string
  eligiblePillars?: string[]
}

export interface SourceContext {
  rssItems: import('@/lib/sources/fetch-rss').RssItem[]
  websiteExcerpts: WebsiteExcerpt[]
  fileExcerpts: FileExcerpt[]
  webSearchItems?: import('@/lib/sources/fetch-trend-search').TrendSearchResult[]
  performanceItems?: PerformanceItem[]
}

export interface SkippedPillar {
  name: string
}

export type { ClientSourceRow } from '@/lib/queries/db'

export interface ResearchRunContext {
  supabase: SupabaseClient
  clientId?: string
  niche: string
  /** How many topics research should choose. May be 0 when the run is briefs-only. */
  count: number
  /** User-supplied topics that must each be planned, in addition to `count`. */
  briefs?: TopicBrief[]
  /** Called as each pipeline phase starts. Used for real-time progress in streaming responses. */
  onPhase?: (message: string, phase: ResearchPhase) => void
  /** Called for each final topic after dedup/retry. Used for streaming responses. */
  onTopic?: (topic: ResearchTopic) => void
  /** Called after research if any pillar had no coverage from assigned sources. */
  onSkippedPillars?: (pillars: SkippedPillar[], skippedCount: number) => void
  /** Optional pre-loaded client data from wizard — skips all DB fetches except client_sources. */
  preloadedClientData?: ClientData
}

export interface SourceFetchResult {
  status: 'ok' | 'error'
  error: string | null
}

export interface SourceFullTextIndex {
  byUrl: Map<string, string>
  byLabel: Map<string, string>
}

export interface SourceAttributionIndex {
  byUrl: Map<string, string>
  byLabel: Map<string, string>
  tavilySourceId: string | null
}

export interface FetchLimits {
  websiteMaxPages: number
  rssItemsPerSource: number
  rssGlobalCap: number
  webBudget: number
  fileBudget: number
}
