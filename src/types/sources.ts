export interface ClientSource {
  id: string
  client_id: string
  type: 'rss' | 'website' | 'file' | 'tavily'
  label: string
  url: string
  is_active: boolean
  last_fetched_at: string | null
  last_fetch_status: string | null
  last_fetch_error: string | null
  config: Record<string, unknown>
  pillar_ids: string[]
  file_path?: string | null
  extracted_text?: string | null
  created_at: string
}

export interface SourceSuggestion {
  url: string
  label: string
  reason: string
}

export interface TavilyConfig {
  include_domains?: string[]
  exclude_domains?: string[]
}

export interface DiscoverPagesResponse {
  pages: string[]
  source: 'sitemap' | 'link_extraction' | 'none'
}
