export interface ClientSource {
  id: string
  client_id: string
  type: 'rss' | 'website' | 'file'
  label: string
  url: string
  is_active: boolean
  last_fetched_at: string | null
  last_fetch_status: string | null
  last_fetch_error: string | null
  config: Record<string, unknown>
  file_path?: string | null
  extracted_text?: string | null
  created_at: string
}

export interface AddSourceRequest {
  type: 'rss' | 'website'
  label: string
  url: string
  config?: Record<string, unknown>
}

export interface AddSourceResponse {
  source: ClientSource
  fetch_status: 'ok' | 'error'
  fetch_error?: string
}

export interface SourceSuggestion {
  url: string
  label: string
  reason: string
  valid: boolean
  error?: string
}

export interface SuggestSourcesRequest {
  niche: string
  clientName?: string
}

export interface SuggestSourcesResponse {
  suggestions: SourceSuggestion[]
}

export interface SourceStrategy {
  trend_fallback?: boolean
  require_source_grounding?: boolean
}

export interface DiscoverPagesRequest {
  url: string
  sitemapUrl?: string
}

export interface DiscoverPagesResponse {
  pages: string[]
  sitemaps: string[]
  source: 'sitemap' | 'sitemap_index' | 'link_extraction' | 'none'
}
