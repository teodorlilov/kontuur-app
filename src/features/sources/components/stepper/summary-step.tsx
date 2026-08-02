'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { createSource } from '@/features/sources/actions/source-actions'
import { WHOLE_SITE_PAGE_CAP } from '@/features/sources/constants'
import type { StepperState, StepperSummary } from '@/features/sources/types'

interface SummaryStepProps {
  clientId: string
  state: StepperState
  websiteSkipped: boolean
  websiteAlreadySaved: boolean
  onWebsiteSaved: (sourceId: string) => void
  onFinished: (summary: StepperSummary) => void
  onBack: () => void
}

interface SummaryRow {
  label: string
  value: string
}

/** Final confirmation: one screen listing everything the AI will read, then save + finish. */
export function SummaryStep({
  clientId,
  state,
  websiteSkipped,
  websiteAlreadySaved,
  onWebsiteSaved,
  onFinished,
  onBack,
}: SummaryStepProps) {
  const [saving, setSaving] = useState(false)

  const hasWebsite = Boolean(state.websiteUrl.trim()) && !websiteSkipped

  // "Whole site" persists the discovered list (capped) so research samples
  // across the site — an empty selection would fetch only the homepage.
  const pagesToSave =
    state.selectedPages.length > 0
      ? state.selectedPages
      : state.discoveredPages.slice(0, WHOLE_SITE_PAGE_CAP)

  let hostname = state.websiteUrl
  try {
    hostname = new URL(state.websiteUrl).hostname
  } catch {
    // keep raw URL
  }

  const rows: SummaryRow[] = []
  if (hasWebsite) {
    const pagesLabel =
      state.selectedPages.length > 0
        ? `${state.selectedPages.length} pages`
        : pagesToSave.length > 0
          ? `whole site (${pagesToSave.length} pages)`
          : 'homepage'
    rows.push({ label: 'Your website', value: `${hostname} · ${pagesLabel}` })
  }
  rows.push({
    label: 'News & blogs',
    value:
      state.selectedRssFeeds.length > 0
        ? `${state.selectedRssFeeds.length} feed${state.selectedRssFeeds.length === 1 ? '' : 's'}`
        : 'None yet',
  })
  if (state.uploadedDocumentIds.length > 0) {
    rows.push({
      label: 'Documents',
      value: `${state.uploadedDocumentIds.length} uploaded`,
    })
  }
  const domainNotes = [
    state.webSearchIncludeDomains.length > 0
      ? `${state.webSearchIncludeDomains.length} preferred`
      : null,
    state.webSearchExcludeDomains.length > 0
      ? `${state.webSearchExcludeDomains.length} blocked`
      : null,
  ].filter(Boolean)
  rows.push({
    label: 'Web research',
    value: state.webSearchEnabled
      ? `On${domainNotes.length > 0 ? ` · ${domainNotes.join(' · ')}` : ''}`
      : 'Off',
  })

  function buildSummary(websiteSaved: boolean): StepperSummary {
    return {
      hasWebsite: websiteSaved,
      pageCount: websiteSaved ? pagesToSave.length : 0,
      feedCount: state.selectedRssFeeds.length,
      documentCount: state.uploadedDocumentIds.length,
      webSearchEnabled: state.webSearchEnabled,
    }
  }

  async function handleFinish() {
    // Website is the only source not yet persisted (feeds/docs/web research
    // save per step); skip the write when there is none or it already saved
    if (!hasWebsite || websiteAlreadySaved) {
      onFinished(buildSummary(websiteAlreadySaved && hasWebsite))
      return
    }

    setSaving(true)
    try {
      const result = await createSource(clientId, {
        type: 'website',
        label: hostname,
        url: state.websiteUrl,
        selectedPages: pagesToSave.length > 0 ? pagesToSave : undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onWebsiteSaved(result.data.source.id)
      onFinished(buildSummary(true))
    } catch {
      toast.error('Failed to save website source')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-sans text-display font-medium text-ink">
          Where we&apos;ll look for post ideas
        </h3>
        <p className="text-body text-text3 mt-1">
          You can change any of this later from Content sources.
        </p>
      </div>

      <div className="bg-sunken rounded-xl divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-3">
            <p className="text-label font-semibold uppercase text-text3">{row.label}</p>
            <p className="text-body font-medium text-ink">{row.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void handleFinish()
          }}
          loading={saving}
        >
          Save and finish
        </Button>
      </div>
    </div>
  )
}
