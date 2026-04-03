import { SOURCE_FULL_TEXT_CAP } from '../fetch-limits'
import { ResearchSource } from './research-source'
import type { FetchLimits, SourceFetchResult, FileExcerpt } from '../types'

export class FileResearchSource extends ResearchSource {
  async fetch(_limits?: FetchLimits): Promise<SourceFetchResult> {
    // File sources read from extracted_text (already in DB row). No network call.
    return { status: this.extractedText ? 'ok' : 'error', error: null }
  }

  /** Check if the file has extracted text content. */
  hasContent(): boolean {
    return !!this.extractedText
  }

  /** Get a single capped file excerpt for the prompt context. */
  getCappedExcerpt(budget: number): FileExcerpt | null {
    if (!this.extractedText) return null
    const text = this.extractedText.slice(0, budget)
    return text.length > 0 ? { label: this.label, text } : null
  }

  getCappedContent(budget: number): string {
    return (this.extractedText ?? '').slice(0, budget)
  }

  getFullTextEntries(cap: number = SOURCE_FULL_TEXT_CAP): Map<string, string> {
    const map = new Map<string, string>()
    if (this.extractedText) {
      map.set(this.label, this.extractedText.slice(0, cap))
    }
    return map
  }
}
