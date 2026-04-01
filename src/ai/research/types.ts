import type { SupabaseClient } from '@supabase/supabase-js'

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

export interface ResearchContext {
  supabase: SupabaseClient
  agencyId: string
  clientId?: string
  niche: string
  language: string
  count: number
}

export interface SourceFetchResult {
  status: 'ok' | 'error'
  error: string | null
}

export interface FullTextMaps {
  sourceFullTextMap: Map<string, string>
  fileFullTextMap: Map<string, string>
}

export interface FetchLimits {
  websiteMaxPages: number
  rssItemsPerSource: number
  rssGlobalCap: number
  rssBudget: number
  webBudget: number
  fileBudget: number
}

export interface FetchOptions {
  limits?: FetchLimits
}
