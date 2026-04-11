import { SOURCE_FULL_TEXT_CAP } from '../fetch-limits'
import { ResearchSource } from './research-source'
import type { FetchLimits, SourceFetchResult, FileExcerpt } from '../types'

export class FileResearchSource extends ResearchSource {
  async fetch(_limits?: FetchLimits): Promise<SourceFetchResult> {
    // File sources read from extracted_text (already in DB row). No network call.
    return { status: this.extractedText ? 'ok' : 'error', error: null }
  }

  isNetworkFetchable(): boolean {
    return false
  }

  hasFileContent(): boolean {
    return !!this.extractedText
  }

  getFileExcerpt(budget: number): FileExcerpt | null {
    if (!this.extractedText) return null
    const text = this.extractedText.slice(0, budget)
    return text.length > 0 ? { label: this.label, text } : null
  }

  addToFullTextIndex(
    _byUrl: Map<string, string>,
    byLabel: Map<string, string>,
    cap: number = SOURCE_FULL_TEXT_CAP
  ): void {
    if (this.extractedText) {
      byLabel.set(this.label, this.extractedText.slice(0, cap))
    }
  }
}
