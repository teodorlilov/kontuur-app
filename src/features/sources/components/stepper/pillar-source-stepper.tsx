'use client'

import { useState, useMemo, useCallback } from 'react'
import { Modal } from '@/components/ui/modal'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { StepperState, StepperPhase } from '@/types/pillar-sources'
import { buildStepSequence } from './build-step-sequence'
import { AssignPillarsStep } from './pillar-map-step'
import { WebsiteUrlStep } from './website-url-step'
import { WebsiteSitemapStep } from './website-sitemap-step'
import { WebsitePagesStep } from './website-pages-step'
import { WebsiteConfirmStep } from './website-confirm-step'
import { RssStep } from './rss-step'
import { DocumentsStep } from './documents-step'
import { WebSearchStep } from './web-search-step'
import { ReviewStep } from './review-step'
import { DoneStep } from './done-step'

interface PillarSourceStepperProps {
  open: boolean
  clientId: string
  clientName: string
  niche: string
  websiteUrl: string
  pillars: WeightedPillar[]
  onComplete: () => void
  onDismiss: () => void
}

function stepTitle(phase: StepperPhase): string {
  switch (phase.type) {
    case 'website-url':
    case 'website-sitemap':
    case 'website-pages':
    case 'website-confirm':
      return 'Website setup'
    case 'rss':
      return 'RSS feeds'
    case 'documents':
      return 'Documents'
    case 'web-search':
      return 'Web Search'
    case 'assign-pillars':
      return 'Assign pillars'
    case 'review':
      return 'Review'
    case 'done':
      return 'Complete'
  }
}

export function PillarSourceStepper({
  open,
  clientId,
  clientName,
  niche,
  websiteUrl: initialWebsiteUrl,
  pillars,
  onComplete,
  onDismiss,
}: PillarSourceStepperProps) {
  const [state, setState] = useState<StepperState>(() => ({
    websiteUrl: initialWebsiteUrl,
    discoveredSitemaps: [],
    selectedSitemapUrl: null,
    discoveredPages: [],
    selectedPages: [],
    selectedRssFeeds: [],
    uploadedDocumentIds: [],
    createdSourceIds: [],
    webSearchEnabled: true,
    webSearchIncludeDomains: [],
    webSearchExcludeDomains: [],
  }))

  const [currentIndex, setCurrentIndex] = useState(0)

  const sequence = useMemo(() => buildStepSequence(), [])
  const currentPhase = sequence[currentIndex] ?? { type: 'done' as const }

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
        s.type !== 'website-sitemap' &&
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

  function handleWebsiteScanned(url: string, sitemaps: string[], pages: string[]) {
    setState((prev) => ({
      ...prev,
      websiteUrl: url,
      discoveredSitemaps: sitemaps,
      discoveredPages: pages,
    }))
    goNext()
  }

  function handleSitemapSelected(sitemapUrl: string, pages: string[]) {
    setState((prev) => ({
      ...prev,
      selectedSitemapUrl: sitemapUrl,
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
            onBack={goBack}
          />
        )

      case 'website-sitemap':
        return (
          <WebsiteSitemapStep
            sitemaps={state.discoveredSitemaps}
            websiteUrl={state.websiteUrl}
            onSelect={handleSitemapSelected}
            onSkipToPages={goNext}
            onBack={goBack}
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
            onSaved={goNext}
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
            onSkip={goNext}
            onBack={goBack}
          />
        )

      case 'documents':
        return (
          <DocumentsStep
            clientId={clientId}
            onUploaded={handleDocumentUploaded}
            onSkip={goNext}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'web-search':
        return (
          <WebSearchStep
            clientId={clientId}
            enabled={state.webSearchEnabled}
            includeDomains={state.webSearchIncludeDomains}
            excludeDomains={state.webSearchExcludeDomains}
            onConfigChange={handleWebSearchConfigChange}
            onSourceCreated={handleSourceCreated}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'assign-pillars':
        return (
          <AssignPillarsStep
            clientId={clientId}
            pillars={pillars}
            createdSourceIds={state.createdSourceIds}
            onNext={goNext}
            onBack={goBack}
          />
        )

      case 'review':
        return (
          <ReviewStep
            state={state}
            onSave={goNext}
            onBack={goBack}
          />
        )

      case 'done':
        return <DoneStep onComplete={onComplete} />

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
