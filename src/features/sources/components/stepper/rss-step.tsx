'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ManualAddInModal } from '@/features/sources/components/manual-add-modal'
import { cn } from '@/utils/cn'
import { toast } from '@/components/ui/toast'
import type { SourceSuggestion } from '@/types/api'

interface RssStepProps {
  clientId: string
  niche: string
  clientName: string
  onSaved: () => void
  onSourceCreated?: (id: string) => void
  onRssFeedAdded?: (label: string, url: string) => void
  onSkip: () => void
  onBack: () => void
}

export function RssStep({ clientId, niche, clientName, onSaved, onSourceCreated, onRssFeedAdded, onSkip, onBack }: RssStepProps) {
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [addingUrl, setAddingUrl] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)
  const [manualSaving, setManualSaving] = useState(false)

  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const res = await fetch('/api/ai/suggest-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ niche, clientName }),
        })
        const data = (await res.json()) as { suggestions?: SourceSuggestion[] }
        setSuggestions(data.suggestions ?? [])
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }
    void fetchSuggestions()
  }, [niche, clientName])

  async function handleAdd(suggestion: SourceSuggestion) {
    setAddingUrl(suggestion.url)
    try {
      const res = await fetch(`/api/clients/${clientId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rss', label: suggestion.label, url: suggestion.url }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error ?? 'Failed to add feed')
        return
      }
      const data = (await res.json()) as { source?: { id: string } }
      if (data.source?.id) onSourceCreated?.(data.source.id)
      onRssFeedAdded?.(suggestion.label, suggestion.url)
      setSuggestions((prev) => prev.filter((s) => s.url !== suggestion.url))
      setAddedCount((c) => c + 1)
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
      const res = await fetch(`/api/clients/${clientId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rss', label, url }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error ?? 'Failed to add feed')
        return
      }
      const data = (await res.json()) as { source?: { id: string } }
      if (data.source?.id) onSourceCreated?.(data.source.id)
      onRssFeedAdded?.(label, url)
      setAddedCount((c) => c + 1)
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
        <h3 className="text-lg font-medium text-gray-900">RSS feeds</h3>
        <p className="text-sm text-gray-500 mt-1">
          Add RSS feeds for industry news and blog content.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 py-4">
          <p className="text-sm text-gray-500">Finding relevant feeds...</p>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : suggestions.length === 0 && addedCount === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          No suggestions found. Add a feed URL manually below.
        </p>
      ) : (
        <div className="flex flex-col gap-3 max-h-[35vh] overflow-y-auto">
          {suggestions.map((s) => (
            <div
              key={s.url}
              className={cn(
                'p-3 rounded-lg border flex items-start justify-between gap-3',
                s.valid ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.label}</p>
                  {s.valid ? (
                    <span className="text-xs text-green-600 shrink-0">Valid</span>
                  ) : (
                    <span className="text-xs text-gray-400 shrink-0" title={s.error}>
                      Unreachable
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{s.url}</p>
                {s.reason && <p className="text-xs text-gray-400 mt-1">{s.reason}</p>}
              </div>
              {s.valid && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={addingUrl === s.url}
                  onClick={() => { void handleAdd(s) }}
                  className="shrink-0"
                >
                  Add
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {addedCount > 0 && (
        <p className="text-xs text-green-600 font-medium">
          {addedCount} feed{addedCount !== 1 ? 's' : ''} added
        </p>
      )}

      <div className="border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-500 mb-2">Add a feed URL manually:</p>
        <ManualAddInModal onAdd={handleManualAdd} isSaving={manualSaving} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Skip for now
          </button>
          <Button size="sm" onClick={onSaved}>
            {addedCount > 0 ? 'Continue' : 'Skip'}
          </Button>
        </div>
      </div>
    </div>
  )
}
