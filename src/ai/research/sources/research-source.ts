import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientSourceRow, FetchLimits, SourceFetchResult, RssItem, WebsiteExcerpt, FileExcerpt } from '../types'

/**
 * Abstract base class for all research content sources.
 * Defines the full contract — subclasses override only the methods relevant to their type.
 * Pipeline works exclusively against this interface; no instanceof checks needed.
 */
export abstract class ResearchSource {
  readonly id: string
  readonly sourceType: string
  readonly label: string
  readonly url: string
  readonly config: Record<string, unknown>
  protected readonly extractedText: string | null

  constructor(row: ClientSourceRow) {
    this.id = row.id
    this.sourceType = row.type
    this.label = row.label
    this.url = row.url
    this.config = row.config
    this.extractedText = row.extracted_text
  }

  /** Fetch content from this source. */
  abstract fetch(limits?: FetchLimits): Promise<SourceFetchResult>

  /**
   * Write this source's full-text entries into the appropriate index map.
   * RSS and website sources key by URL (byUrl); file sources key by label (byLabel).
   * Each subclass knows which map it belongs to — pipeline never decides.
   */
  abstract addToFullTextIndex(byUrl: Map<string, string>, byLabel: Map<string, string>, cap: number): void

  // ---- Content accessors (Null Object defaults — override only what applies) ----

  /** Whether this source requires a network fetch. File sources return false. */
  isNetworkFetchable(): boolean { return true }

  /** RSS items fetched from this source. Only RssResearchSource returns non-empty. */
  getRssItems(): RssItem[] { return [] }

  /** Website excerpts fetched from this source. Only WebsiteResearchSource returns non-empty. */
  getWebExcerpts(): WebsiteExcerpt[] { return [] }

  /** Whether this file source has extracted text content. Only FileResearchSource returns true. */
  hasFileContent(): boolean { return false }

  /** Capped file excerpt for prompt context. Only FileResearchSource returns non-null. */
  getFileExcerpt(_budget: number): FileExcerpt | null { return null }

  // ---- Shared ----

  /** Fire-and-forget DB status update after a network fetch. */
  reportStatus(supabase: SupabaseClient, result: SourceFetchResult): void {
    void supabase
      .from('client_sources')
      .update({
        last_fetched_at: new Date().toISOString(),
        last_fetch_status: result.status,
        last_fetch_error: result.error,
      })
      .eq('id', this.id)
  }
}
