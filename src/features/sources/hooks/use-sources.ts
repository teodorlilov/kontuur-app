'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import type { ClientSource, SourceSuggestion, SourceStrategy } from '@/types/api'

async function withRollback<T>(
  previous: T,
  restore: (v: T) => void,
  fetchFn: () => Promise<Response>,
  errorMessage: string
): Promise<boolean> {
  try {
    const res = await fetchFn()
    if (!res.ok) {
      restore(previous)
      toast.error(errorMessage)
      return false
    }
    return true
  } catch {
    restore(previous)
    toast.error(errorMessage)
    return false
  }
}

interface UseSourcesOptions {
  clientId: string
  clientName: string
  niche: string
  initialSources: ClientSource[]
  initialSourceStrategy?: SourceStrategy
}

export function useSources({
  clientId,
  clientName,
  niche,
  initialSources,
  initialSourceStrategy,
}: UseSourcesOptions) {
  const [sources, setSources] = useState<ClientSource[]>(initialSources)
  const [strategy, setStrategy] = useState<SourceStrategy>(
    initialSourceStrategy ?? {}
  )
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [addingFromSuggestion, setAddingFromSuggestion] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  async function handleToggleGrounding(enabled: boolean) {
    const updated: SourceStrategy = { ...strategy, require_source_grounding: enabled }
    const previous = strategy
    setStrategy(updated)
    await withRollback(previous, setStrategy,
      () => fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_profile: { source_strategy: updated } }),
      }),
      'Failed to save research settings'
    )
  }

  async function handleSuggest() {
    setSuggesting(true)
    setShowModal(true)
    try {
      const res = await fetch('/api/ai/suggest-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, clientName }),
      })
      const data = (await res.json()) as { suggestions: SourceSuggestion[] }
      setSuggestions(data.suggestions ?? [])
    } catch {
      toast.error('Failed to load suggestions')
      setSuggestions([])
    } finally {
      setSuggesting(false)
    }
  }

  async function handleAddSource(
    type: 'rss' | 'website',
    label: string,
    url: string,
    options?: { focusInstructions?: string; selectedPages?: string[] }
  ) {
    setIsSaving(true)
    try {
      const payload: Record<string, unknown> = { type, label: label.trim(), url: url.trim() }
      if (type === 'website') {
        if (options?.focusInstructions?.trim()) {
          payload.focusInstructions = options.focusInstructions.trim()
        }
        if (options?.selectedPages && options.selectedPages.length > 0) {
          payload.selectedPages = options.selectedPages
        }
      }
      const res = await fetch(`/api/clients/${clientId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as {
        source?: ClientSource
        fetch_status?: string
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add source')
        return false
      }
      if (data.source) {
        setSources((prev) => [data.source!, ...prev])
        if (data.fetch_status === 'error') {
          toast.error('Source added but could not be reached — check the URL')
        } else {
          toast.success('Source added')
        }
      }
      return true
    } catch {
      toast.error('Failed to add source')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUploadFile(file: File, label: string) {
    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('label', label.trim())

      const res = await fetch(`/api/clients/${clientId}/sources/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = (await res.json()) as { source?: ClientSource; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Upload failed')
        return false
      }
      if (data.source) {
        setSources((prev) => [data.source!, ...prev])
        toast.success('Document uploaded and text extracted')
      }
      return true
    } catch {
      toast.error('Upload failed')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAddFromSuggestion(suggestion: SourceSuggestion) {
    setAddingFromSuggestion(suggestion.url)
    try {
      const res = await fetch(`/api/clients/${clientId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rss', label: suggestion.label, url: suggestion.url }),
      })
      const data = (await res.json()) as { source?: ClientSource; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add source')
        return
      }
      if (data.source) {
        setSources((prev) => [data.source!, ...prev])
        setSuggestions((prev) => prev.filter((s) => s.url !== suggestion.url))
        toast.success(`Added ${suggestion.label}`)
      }
    } catch {
      toast.error('Failed to add source')
    } finally {
      setAddingFromSuggestion(null)
    }
  }

  async function handleEditSource(
    sourceId: string,
    updates: { label?: string; url?: string; config?: Record<string, unknown>; pillar_ids?: string[] }
  ) {
    const previous = sources
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, ...updates } : s)))
    const ok = await withRollback(previous, setSources,
      () => fetch(`/api/clients/${clientId}/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),
      'Failed to update source'
    )
    if (ok) toast.success('Source updated')
    return ok
  }

  async function handleToggleActive(source: ClientSource) {
    const previous = sources
    setSources((prev) =>
      prev.map((s) => (s.id === source.id ? { ...s, is_active: !s.is_active } : s))
    )
    await withRollback(previous, setSources,
      () => fetch(`/api/clients/${clientId}/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !source.is_active }),
      }),
      'Failed to update source'
    )
  }

  async function handleDelete(source: ClientSource) {
    const previous = sources
    setSources((prev) => prev.filter((s) => s.id !== source.id))
    const ok = await withRollback(previous, setSources,
      () => fetch(`/api/clients/${clientId}/sources/${source.id}`, { method: 'DELETE' }),
      'Failed to delete source'
    )
    if (ok) toast.success('Source removed')
  }

  return {
    sources,
    strategy,
    suggestions,
    isSaving,
    suggesting,
    addingFromSuggestion,
    showModal,
    setShowModal,
    handleToggleGrounding,
    handleSuggest,
    handleAddSource,
    handleUploadFile,
    handleAddFromSuggestion,
    handleEditSource,
    handleToggleActive,
    handleDelete,
  }
}
