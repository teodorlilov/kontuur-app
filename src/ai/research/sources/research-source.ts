import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientSourceRow, FetchLimits, SourceFetchResult } from '../types'

/**
 * Abstract base class for all research content sources.
 * Concrete subclasses handle fetching, budgeting, and full-text mapping
 * for their specific source type (RSS, website, file).
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

  /** Fetch content from this source. File sources are no-ops. */
  abstract fetch(limits?: FetchLimits): Promise<SourceFetchResult>

  /** Return capped text content within the given character budget. */
  abstract getCappedContent(budget: number): string

  /** Return full-text map entries for source grounding (key → uncapped text). */
  abstract getFullTextEntries(cap: number): Map<string, string>

  /** Fire-and-forget DB status update (shared by all subclasses). */
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
