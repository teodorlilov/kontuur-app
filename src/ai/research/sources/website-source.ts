import { fetchWebsiteWithSubpages } from '@/lib/sources/fetch-website'
import { SOURCE_FULL_TEXT_CAP } from '../fetch-limits'
import { ResearchSource } from './research-source'
import type { FetchLimits, SourceFetchResult, WebsiteExcerpt } from '../types'

export class WebsiteResearchSource extends ResearchSource {
  private excerpts: WebsiteExcerpt[] = []
  private fetchError: string | null = null

  // maxPages applies per source — a client with 2 website sources fetches maxPages from each
  async fetch(limits?: FetchLimits): Promise<SourceFetchResult> {
    const maxPages = limits?.websiteMaxPages
    const result = await fetchWebsiteWithSubpages(this.url, this.config, maxPages)
    const focusInstructions = (this.config?.focus_instructions as string) ?? undefined

    this.excerpts = result.excerpts
      .filter((e) => e.markdown)
      .map((e) => ({ url: e.url, text: e.markdown, focusInstructions }))

    this.fetchError = result.error ?? null
    return {
      status: this.fetchError ? 'error' : this.excerpts.length > 0 ? 'ok' : 'error',
      error: this.fetchError,
    }
  }

  getWebExcerpts(): WebsiteExcerpt[] {
    return this.excerpts
  }

  addToFullTextIndex(byUrl: Map<string, string>, _byLabel: Map<string, string>, cap: number = SOURCE_FULL_TEXT_CAP): void {
    for (const w of this.excerpts) {
      byUrl.set(w.url, w.text.slice(0, cap))
    }
  }
}
