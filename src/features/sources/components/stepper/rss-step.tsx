'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ManualAddInModal } from '@/features/sources/components/manual-add-modal'
import { toast } from '@/components/ui/toast'
import { createSource } from '@/features/sources/actions/source-actions'
import type { SourceSuggestion } from '@/types/api'
import type { FetchStatus } from '@/features/sources/types'

interface RssStepProps {
  clientId: string
  suggestions: SourceSuggestion[]
  suggestionsStatus: FetchStatus
  onRetrySuggestions: () => void
  onSaved: () => void
  onSourceCreated?: (id: string) => void
  onRssFeedAdded?: (label: string, url: string) => void
  onBack: () => void
}

export function RssStep({
  clientId,
  suggestions,
  suggestionsStatus,
  onRetrySuggestions,
  onSaved,
  onSourceCreated,
  onRssFeedAdded,
  onBack,
}: RssStepProps) {
  const [addingUrl, setAddingUrl] = useState<string | null>(null)
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set())
  const [manualSaving, setManualSaving] = useState(false)

  const remaining = suggestions.filter((s) => !addedUrls.has(s.url))
  const addedCount = addedUrls.size
  const loading = suggestionsStatus === 'running' || suggestionsStatus === 'idle'

  async function handleAdd(suggestion: SourceSuggestion) {
    setAddingUrl(suggestion.url)
    try {
      const result = await createSource(clientId, {
        type: 'rss',
        label: suggestion.label,
        url: suggestion.url,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onSourceCreated?.(result.data.source.id)
      onRssFeedAdded?.(suggestion.label, suggestion.url)
      setAddedUrls((prev) => new Set(prev).add(suggestion.url))
      toast.success(`Added ${suggestion.label}`)
    } catch {
      toast.error('Failed to add feed')
    } finally {
      setAddingUrl(null)
    }
  }

  async function handleManualAdd(label: string, url: string) {
    setManualSaving(true)
    try {
      const result = await createSource(clientId, { type: 'rss', label, url })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onSourceCreated?.(result.data.source.id)
      onRssFeedAdded?.(label, url)
      setAddedUrls((prev) => new Set(prev).add(url))
      toast.success('Feed added')
    } catch {
      toast.error('Failed to add feed')
    } finally {
      setManualSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-sans text-display font-medium text-ink">News &amp; blogs</h3>
        <p className="text-body text-text3 mt-1">
          We&apos;ll watch these feeds for fresh articles to inspire post ideas.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 py-4">
          <p className="text-body text-text3">Finding news sites and blogs for your niche...</p>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-sunken animate-pulse" />
          ))}
        </div>
      ) : suggestionsStatus === 'failed' ? (
        <div className="flex items-center justify-between rounded-lg border border-line bg-sunken px-4 py-3">
          <p className="text-body text-text3">
            Couldn&apos;t find suggestions. Retry, or paste a feed URL below.
          </p>
          <Button variant="secondary" size="sm" onClick={onRetrySuggestions}>
            Retry
          </Button>
        </div>
      ) : remaining.length === 0 && addedCount === 0 ? (
        <p className="text-body text-text3 py-4">
          Nothing found automatically. Paste a feed URL below.
        </p>
      ) : (
        <div className="flex flex-col gap-3 max-h-[35vh] overflow-y-auto">
          {remaining.map((s) => (
            <div
              key={s.url}
              className="p-3 rounded-lg border border-line flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-body font-medium text-ink truncate">{s.label}</p>
                <p className="text-caption text-text3 truncate mt-0.5">{s.url}</p>
                {s.reason && <p className="text-caption text-text3 mt-1">{s.reason}</p>}
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={addingUrl === s.url}
                onClick={() => {
                  void handleAdd(s)
                }}
                className="shrink-0"
              >
                Add
              </Button>
            </div>
          ))}
        </div>
      )}

      {addedCount > 0 && (
        <p className="text-caption text-spring-text font-medium">
          {addedCount} feed{addedCount !== 1 ? 's' : ''} added
        </p>
      )}

      <div className="border-t border-line pt-4">
        <p className="text-caption text-text3 mb-2">Add a feed manually:</p>
        <ManualAddInModal onAdd={handleManualAdd} isSaving={manualSaving} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={onSaved}>
          {addedCount > 0 ? 'Continue' : 'Skip for now'}
        </Button>
      </div>
    </div>
  )
}
