'use client'

import { useState, useMemo, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { StepperState, StepperPhase, StepperSummary } from '@/features/sources/types'
import { buildStepSequence } from './build-step-sequence'
import { WebsiteUrlStep } from './website-url-step'
import { WebsitePagesStep } from './website-pages-step'
import { WebsiteConfirmStep } from './website-confirm-step'
import { RssStep } from './rss-step'
import { ExtrasStep } from './extras-step'
import { ReviewStep } from './review-step'

interface PillarSourceStepperProps {
  open: boolean
  clientId: string
  clientName: string
  niche: string
  websiteUrl: string
  pillars: WeightedPillar[]
  onFinished: (summary: StepperSummary) => void
  onDismiss: () => void
}

function stepTitle(phase: StepperPhase): string {
  switch (phase.type) {
    case 'website-url':
    case 'website-pages':
    case 'website-confirm':
      return 'Website setup'
    case 'rss':
      return 'News & blogs'
    case 'extras':
      return 'Extras'
    case 'review':
      return 'Review'
  }
}

export function PillarSourceStepper({
  open,
  clientId,
  clientName,
  niche,
  websiteUrl: initialWebsiteUrl,
  onFinished,
  onDismiss,
}: PillarSourceStepperProps) {
  const [state, setState] = useState<StepperState>(() => ({
    websiteUrl: initialWebsiteUrl,
    discoveredPages: [],
    selectedPages: [],
    selectedRssFeeds: [],
    uploadedDocumentIds: [],
    createdSourceIds: [],
    webSearchEnabled: true,
    webSearchIncludeDomains: [],
    webSearchExcludeDomains: [],
  }))
  const [websiteSaved, setWebsiteSaved] = useState(false)

  const [currentIndex, setCurrentIndex] = useState(0)

  const sequence = useMemo(() => buildStepSequence(), [])
  const currentPhase = sequence[currentIndex] ?? { type: 'review' as const }

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, sequence.length - 1))
  }, [sequence.length])

  const goBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  function handleSkipWebsite() {
    const nextNonWebsite = sequence.findIndex(
      (s, i) =>
        i > currentIndex &&
        s.type !== 'website-url' &&
        s.type !== 'website-pages' &&
        s.type !== 'website-confirm'
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
      case 'website-url':
        return (
          <WebsiteUrlStep
            initialUrl={state.websiteUrl}
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

      case 'website-confirm':
        return (
          <WebsiteConfirmStep
            clientId={clientId}
            websiteUrl={state.websiteUrl}
            selectedPages={state.selectedPages}
            discoveredPages={state.discoveredPages}
            onSaved={() => {
              setWebsiteSaved(true)
              goNext()
            }}
            onSourceCreated={handleSourceCreated}
            onBack={goBack}
          />
        )

      case 'rss':
        return (
          <RssStep
            clientId={clientId}
            niche={niche}
            clientName={clientName}
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

      case 'review':
        return (
          <ReviewStep
            state={state}
            onSave={() =>
              onFinished({
                hasWebsite: websiteSaved,
                pageCount: state.selectedPages.length,
                feedCount: state.selectedRssFeeds.length,
                documentCount: state.uploadedDocumentIds.length,
                webSearchEnabled: state.webSearchEnabled,
              })
            }
            onBack={goBack}
          />
        )

      default:
        return null
    }
  }

  return (
    <Modal
      open={open}
      onClose={onDismiss}
      title={stepTitle(currentPhase)}
      maxWidth={672}
    >
      <div className="mb-5">
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-brand-purple h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5 text-right">
          Step {currentIndex + 1} of {sequence.length}
        </p>
      </div>

      {renderStep()}
    </Modal>
  )
}
