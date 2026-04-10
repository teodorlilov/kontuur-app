import type { SupabaseClient } from '@supabase/supabase-js'
import type { SourceStrategy } from '@/types/api'

export type { RssItem } from '@/lib/sources/fetch-rss'
export type { WeightedPillar } from '@/lib/clients/content-pillars'
export type { SourceStrategy } from '@/types/api'

export interface ResearchTopic {
  finding: string
  suggested_theme: string
  pillar?: string
  source_url?: string | null
  source_title?: string | null
  source_type?: 'rss' | 'website' | 'file' | null
  source_excerpt?: string
  /** Full source text attached after LLM research, from the fetched source map. Not LLM-generated. */
  source_full_text?: string
}

export interface WebsiteExcerpt {
  url: string
  text: string
  focusInstructions?: string
}

export interface FileExcerpt {
  label: string
  text: string
}

export interface SourceContext {
  rssItems: import('@/lib/sources/fetch-rss').RssItem[]
  websiteExcerpts: WebsiteExcerpt[]
  fileExcerpts: FileExcerpt[]
}

export interface ClientSourceRow {
  id: string
  type: string
  label: string
  url: string
  config: Record<string, unknown>
  extracted_text: string | null
}

/**
 * Pre-loaded brand profile data passed from the wizard to avoid redundant DB fetches.
 * When provided, the pipeline skips the brand_profiles and language_rules DB queries.
 */
export interface PreloadedClientData {
  contentPillars: string | null
  sourceStrategy: SourceStrategy | null
  languageFormality: string | null
  languageNotes: string | null
  languageInstructions: string | null
  /** Pre-fetched post history — when present, pipeline skips the post_history + generation_runs DB queries. */
  postHistory?: string[]
}

export interface ResearchRunContext {
  supabase: SupabaseClient
  agencyId: string
  clientId?: string
  niche: string
  language: string
  count: number
  /** Called as each pipeline phase starts. Used for real-time progress in streaming responses. */
  onPhase?: (message: string) => void
  /** Called for each final topic after dedup/retry. Used for streaming responses. */
  onTopic?: (topic: ResearchTopic) => void
  /** Optional pre-loaded brand profile from wizard — skips brand_profiles + language_rules DB fetch. */
  preloaded?: PreloadedClientData
}

export type ResearchStreamEvent =
  | { type: 'phase'; message: string }
  | { type: 'topic'; data: ResearchTopic }

export interface SourceFetchResult {
  status: 'ok' | 'error'
  error: string | null
}

export interface SourceFullTextIndex {
  byUrl: Map<string, string>
  byLabel: Map<string, string>
}

export interface FetchLimits {
  websiteMaxPages: number
  rssItemsPerSource: number
  rssGlobalCap: number
  rssBudget: number
  webBudget: number
  fileBudget: number
}

