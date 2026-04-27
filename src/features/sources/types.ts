export interface StepperState {
  websiteUrl: string
  discoveredSitemaps: string[]
  selectedSitemapUrl: string | null
  discoveredPages: string[]
  selectedPages: string[]
  selectedRssFeeds: { label: string; url: string }[]
  uploadedDocumentIds: string[]
  createdSourceIds: string[]
  webSearchEnabled: boolean
  webSearchIncludeDomains: string[]
  webSearchExcludeDomains: string[]
}

export type StepperPhase =
  | { type: 'website-url' }
  | { type: 'website-sitemap' }
  | { type: 'website-pages' }
  | { type: 'website-confirm' }
  | { type: 'rss' }
  | { type: 'documents' }
  | { type: 'web-search' }
  | { type: 'assign-pillars' }
  | { type: 'review' }
  | { type: 'done' }
