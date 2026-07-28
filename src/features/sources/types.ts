export interface StepperState {
  websiteUrl: string
  discoveredSitemaps: string[]
  discoveredPages: string[]
  selectedPages: string[]
  selectedRssFeeds: { label: string; url: string }[]
  uploadedDocumentIds: string[]
  createdSourceIds: string[]
  webSearchEnabled: boolean
  webSearchIncludeDomains: string[]
  webSearchExcludeDomains: string[]
}

/** Counts shown on the onboarding success overlay after the stepper finishes. */
export interface StepperSummary {
  hasWebsite: boolean
  pageCount: number
  feedCount: number
  documentCount: number
  webSearchEnabled: boolean
}

export type StepperPhase =
  | { type: 'website-url' }
  | { type: 'website-sitemap' }
  | { type: 'website-pages' }
  | { type: 'website-confirm' }
  | { type: 'rss' }
  | { type: 'documents' }
  | { type: 'web-search' }
  | { type: 'review' }
