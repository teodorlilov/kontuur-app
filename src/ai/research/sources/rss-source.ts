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

  getRssItems(): RssItem[] {
    return this.items
  }

  addToFullTextIndex(
    byUrl: Map<string, string>,
    _byLabel: Map<string, string>,
    cap: number = SOURCE_FULL_TEXT_CAP
  ): void {
    for (const item of this.items) {
      if (item.link) {
        byUrl.set(item.link, `${item.title}\n${item.description}`.slice(0, cap))
      }
    }
  }
}
