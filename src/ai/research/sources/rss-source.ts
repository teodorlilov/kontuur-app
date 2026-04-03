import { fetchRssSource, type RssItem } from '@/lib/sources/fetch-rss'
import { SOURCE_FULL_TEXT_CAP } from '../fetch-limits'
import { ResearchSource } from './research-source'
import type { FetchLimits, SourceFetchResult } from '../types'

export class RssResearchSource extends ResearchSource {
  private items: RssItem[] = []
  private fetchError: string | null = null

  async fetch(limits?: FetchLimits): Promise<SourceFetchResult> {
    const configMax = (this.config?.max_items as number | undefined) ?? 4
    const maxItems = Math.min(configMax, limits?.rssItemsPerSource ?? configMax)
    const result = await fetchRssSource(this.url, maxItems)
    this.items = result.items
    this.fetchError = result.error ?? null
    return {
      status: this.fetchError ? 'error' : 'ok',
      error: this.fetchError,
    }
  }

  /** Get the raw fetched items for pipeline aggregation across all RSS sources. */
  getItems(): RssItem[] {
    return this.items
  }

  getCappedContent(budget: number): string {
    return this.items
      .map((item) => `- ${item.title}: ${item.description}${item.link ? ` (${item.link})` : ''}`)
      .join('\n')
      .slice(0, budget)
  }

  getFullTextEntries(cap: number = SOURCE_FULL_TEXT_CAP): Map<string, string> {
    const map = new Map<string, string>()
    for (const item of this.items) {
      if (item.link) {
        map.set(item.link, `${item.title}\n${item.description}`.slice(0, cap))
      }
    }
    return map
  }
}
