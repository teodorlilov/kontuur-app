import { fetchRssSource, type RssItem } from '@/lib/sources/fetch-rss'
import { SOURCE_FULL_TEXT_CAP } from '../fetch-limits'
import { ResearchSource } from './research-source'
import { shuffleArray } from '@/utils/shuffle'
import type { FetchLimits, SourceFetchResult } from '../types'

export class RssResearchSource extends ResearchSource {
  private items: RssItem[] = []
  private fetchError: string | null = null

  async fetch(limits?: FetchLimits): Promise<SourceFetchResult> {
    const configMax = (this.config?.max_items as number | undefined) ?? 4
    const maxItems = Math.min(configMax, limits?.rssItemsPerSource ?? configMax)
    // Fetch a larger pool then randomly sample — prevents same articles every run
    const fetchCount = Math.min(maxItems * 4, 20)
    const result = await fetchRssSource(this.url, fetchCount)
    this.items = shuffleArray(result.items).slice(0, maxItems)
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
