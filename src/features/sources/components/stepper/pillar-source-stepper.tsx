'use client'

import { useState, useMemo, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import type {
  StepperState,
  StepperPhase,
  StepperSummary,
  FetchStatus,
} from '@/features/sources/types'
import type { SourceSuggestion } from '@/types/api'
import { buildStepSequence } from './build-step-sequence'
import { ScanStep } from './scan-step'
import { WebsitePagesStep } from './website-pages-step'
import { RssStep } from './rss-step'
import { ExtrasStep } from './extras-step'
import { SummaryStep } from './summary-step'

interface PillarSourceStepperProps {
  open: boolean
  clientId: string
  websiteUrl: string
  prescanStatus: FetchStatus
  prescannedPages: string[]
  onScanRequested: (url: string) => void
  feedSuggestions: SourceSuggestion[]
  feedStatus: FetchStatus
  onRetryFeedSuggestions: () => void
  onFinished: (summary: StepperSummary) => void
  onDismiss: () => void
}

function stepTitle(phase: StepperPhase): string {
  switch (phase.type) {
    case 'scan':
    case 'website-pages':
      return 'Your website'
    case 'rss':
      return 'News & blogs'
    case 'extras':
      return 'Extras'
    case 'summary':
      return 'Summary'
  }
}

export function PillarSourceStepper({
  open,
  clientId,
  websiteUrl: initialWebsiteUrl,
  prescanStatus,
  prescannedPages,
  onScanRequested,
  feedSuggestions,
  feedStatus,
  onRetryFeedSuggestions,
  onFinished,
  onDismiss,
}: PillarSourceStepperProps) {
  // Seed from the pre-scan that ran during the interview so the scan step
  // never paints when results are already in hand
  const [state, setState] = useState<StepperState>(() => ({
    websiteUrl: initialWebsiteUrl,
    discoveredPages: prescanStatus === 'done' ? prescannedPages : [],
    selectedPages: [],
    selectedRssFeeds: [],
    uploadedDocumentIds: [],
    createdSourceIds: [],
    webSearchEnabled: true,
    webSearchIncludeDomains: [],
    webSearchExcludeDomains: [],
  }))
  const [websiteSaved, setWebsiteSaved] = useState(false)
  const [websiteSkipped, setWebsiteSkipped] = useState(false)

  const [currentIndex, setCurrentIndex] = useState(() =>
    prescanStatus === 'done' && initialWebsiteUrl.trim() ? 1 : 0
  )

  const sequence = useMemo(() => buildStepSequence(), [])
  const currentPhase = sequence[currentIndex] ?? { type: 'summary' as const }

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, sequence.length - 1))
  }, [sequence.length])

  const goBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  function handleSkipWebsite() {
    setWebsiteSkipped(true)
    const nextNonWebsite = sequence.findIndex(
      (s, i) => i > currentIndex && s.type !== 'scan' && s.type !== 'website-pages'
    )
    if (nextNonWebsite !== -1) setCurrentIndex(nextNonWebsite)
    else goNext()
  }

  function handleSourceCreated(id: string) {
    setState((prev) => ({
      ...prev,
      createdSourceIds: [...prev.createdSourceIds, id],
    }))
  }

  function handleRssFeedAdded(label: string, url: string) {
    setState((prev) => ({
      ...prev,
      selectedRssFeeds: [...prev.selectedRssFeeds, { label, url }],
    }))
  }

  function handleWebsiteScanned(url: string, pages: string[]) {
    setWebsiteSkipped(false)
    setState((prev) => ({
      ...prev,
      websiteUrl: url,
      discoveredPages: pages,
    }))
    goNext()
  }

  function handlePagesChanged(selected: string[]) {
    setState((prev) => ({ ...prev, selectedPages: selected }))
  }

  function handleWebSearchConfigChange(config: {
    enabled: boolean
    includeDomains: string[]
    excludeDomains: string[]
  }) {
    setState((prev) => ({
      ...prev,
      webSearchEnabled: config.enabled,
      webSearchIncludeDomains: config.includeDomains,
      webSearchExcludeDomains: config.excludeDomains,
    }))
  }

  function handleDocumentUploaded(docId: string) {
    setState((prev) => ({
      ...prev,
      uploadedDocumentIds: [...prev.uploadedDocumentIds, docId],
      createdSourceIds: [...prev.createdSourceIds, docId],
    }))
  }

  let siteOrigin = ''
  try {
    if (state.websiteUrl) siteOrigin = new URL(state.websiteUrl).origin
  } catch {
    // invalid URL
  }

  const progressPct = sequence.length > 1 ? (currentIndex / (sequence.length - 1)) * 100 : 0

  function renderStep() {
    switch (currentPhase.type) {
      case 'scan':
        return (
          <ScanStep
            initialUrl={state.websiteUrl}
            prescanStatus={prescanStatus}
            prescannedPages={prescannedPages}
            alreadyScanned={state.discoveredPages.length > 0}
            onScanRequested={onScanRequested}
            onScanned={handleWebsiteScanned}
            onSkip={handleSkipWebsite}
          />
        )

      case 'website-pages':
        return (
          <WebsitePagesStep
            pages={state.discoveredPages}
            siteOrigin={siteOrigin}
            selectedPages={state.selectedPages}
            onChange={handlePagesChanged}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'rss':
        return (
          <RssStep
            clientId={clientId}
            suggestions={feedSuggestions}
            suggestionsStatus={feedStatus}
            onRetrySuggestions={onRetryFeedSuggestions}
            onSaved={goNext}
            onSourceCreated={handleSourceCreated}
            onRssFeedAdded={handleRssFeedAdded}
            onBack={goBack}
          />
        )

      case 'extras':
        return (
          <ExtrasStep
            clientId={clientId}
            webSearchEnabled={state.webSearchEnabled}
            webSearchIncludeDomains={state.webSearchIncludeDomains}
            webSearchExcludeDomains={state.webSearchExcludeDomains}
            onWebSearchConfigChange={handleWebSearchConfigChange}
            onDocumentUploaded={handleDocumentUploaded}
            onSourceCreated={handleSourceCreated}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'summary':
        return (
          <SummaryStep
            clientId={clientId}
            state={state}
            websiteSkipped={websiteSkipped}
            websiteAlreadySaved={websiteSaved}
            onWebsiteSaved={(sourceId) => {
              setWebsiteSaved(true)
              handleSourceCreated(sourceId)
            }}
            onFinished={onFinished}
            onBack={goBack}
          />
        )

      default:
        return null
    }
  }

  return (
    <Modal open={open} onClose={onDismiss} title={stepTitle(currentPhase)} maxWidth={672}>
      <div className="mb-5">
        <div className="w-full bg-sunken rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%`, background: 'var(--forest)' }}
          />
        </div>
        <p className="text-caption text-text3 mt-1.5 text-right">
          Step {currentIndex + 1} of {sequence.length}
        </p>
      </div>

      {renderStep()}
    </Modal>
  )
}
