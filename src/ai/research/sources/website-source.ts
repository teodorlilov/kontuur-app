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

  /** Get raw (uncapped) excerpts for pipeline budgeting. */
  getRawExcerpts(): WebsiteExcerpt[] {
    return this.excerpts
  }

  /** Get excerpts capped to fit within total budget, distributed across all excerpts. */
  getCappedExcerpts(budget: number): WebsiteExcerpt[] {
    if (this.excerpts.length === 0) return []
    const perExcerpt = Math.floor(budget / this.excerpts.length)
    return this.excerpts
      .map((w) => ({ ...w, text: w.text.slice(0, perExcerpt) }))
      .filter((w) => w.text.length > 0)
  }

  getCappedContent(budget: number): string {
    return this.getCappedExcerpts(budget)
      .map((w) => w.text)
      .join('\n\n---\n\n')
  }

  getFullTextEntries(cap: number = SOURCE_FULL_TEXT_CAP): Map<string, string> {
    const map = new Map<string, string>()
    for (const w of this.excerpts) {
      map.set(w.url, w.text.slice(0, cap))
    }
    return map
  }
}
