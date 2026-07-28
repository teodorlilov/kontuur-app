export interface StepperState {
  websiteUrl: string
  discoveredPages: string[]
  selectedPages: string[]
  selectedRssFeeds: { label: string; url: string }[]
  uploadedDocumentIds: string[]
  createdSourceIds: string[]
  webSearchEnabled: boolean
  webSearchIncludeDomains: string[]
  webSearchExcludeDomains: string[]
}

/** Lifecycle of a parent-owned background fetch (website pre-scan, feed prefetch). */
export type FetchStatus = 'idle' | 'running' | 'done' | 'failed'

/** Counts shown on the onboarding success overlay after the stepper finishes. */
export interface StepperSummary {
  hasWebsite: boolean
  pageCount: number
  feedCount: number
  documentCount: number
  webSearchEnabled: boolean
}

export type StepperPhase =
  | { type: 'scan' }
  | { type: 'website-pages' }
  | { type: 'rss' }
  | { type: 'extras' }
  | { type: 'summary' }
