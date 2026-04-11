'use client'

import { useState, useEffect } from 'react'
import { toast } from '@/components/ui/toast'
import type { ClientSource, SourceSuggestion, SourceStrategy } from '@/types/api'

const DEFAULT_STRATEGY: SourceStrategy = {
  rss: true,
  website: true,
  file: true,
  trend_fallback: true,
}

interface UseSourcesOptions {
  clientId: string
  clientName: string
  niche: string
  initialSources: ClientSource[]
  isOnboarding: boolean
  initialSourceStrategy?: SourceStrategy
}

export function useSources({
  clientId,
  clientName,
  niche,
  initialSources,
  isOnboarding,
  initialSourceStrategy,
}: UseSourcesOptions) {
  const [sources, setSources] = useState<ClientSource[]>(initialSources)
  const [strategy, setStrategy] = useState<SourceStrategy>(
    initialSourceStrategy ?? DEFAULT_STRATEGY
  )
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [savingStrategy, setSavingStrategy] = useState(false)
  const [addingFromSuggestion, setAddingFromSuggestion] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (isOnboarding && niche) {
      void handleSuggest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveStrategy(updated: SourceStrategy) {
    const enabledCount = [
      updated.rss,
      updated.website,
      updated.file,
      updated.trend_fallback,
    ].filter(Boolean).length
    if (enabledCount === 0) {
      toast.error('At least one source type must be enabled')
      return
    }

    // Deactivate sources whose type is being disabled
    const nowDisabled = (['rss', 'website', 'file'] as const).filter(
      (t) => !updated[t] && strategy[t]
    )
    const toDeactivate =
      nowDisabled.length > 0
        ? sources.filter(
            (s) => nowDisabled.includes(s.type as 'rss' | 'website' | 'file') && s.is_active
          )
        : []

    const previous = strategy
    setStrategy(updated)
    if (toDeactivate.length > 0) {
      setSources((prev) =>
        prev.map((s) => (toDeactivate.some((d) => d.id === s.id) ? { ...s, is_active: false } : s))
      )
    }
    setSavingStrategy(true)

    try {
      await Promise.all([
        fetch(`/api/clients/${clientId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_profile: { source_strategy: updated } }),
        }),
        ...toDeactivate.map((s) =>
          fetch(`/api/clients/${clientId}/sources/${s.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: false }),
          })
        ),
      ]).then((responses) => {
        if (responses.some((r) => !r.ok)) {
          setStrategy(previous)
          toast.error('Failed to save source strategy')
        }
      })
    } catch {
      setStrategy(previous)
      toast.error('Failed to save source strategy')
    } finally {
      setSavingStrategy(false)
    }
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
    updates: { label?: string; url?: string; config?: Record<string, unknown> }
  ) {
    const previous = sources
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, ...updates } : s)))

    try {
      const res = await fetch(`/api/clients/${clientId}/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        setSources(previous)
        toast.error('Failed to update source')
        return false
      }
      toast.success('Source updated')
      return true
    } catch {
      setSources(previous)
      toast.error('Failed to update source')
      return false
    }
  }

  async function handleToggleActive(source: ClientSource) {
    const typeKey = source.type as 'rss' | 'website' | 'file'
    if (!source.is_active && strategy[typeKey] === false) {
      toast.error(
        `Enable "${source.type === 'rss' ? 'RSS feeds' : source.type === 'website' ? 'Website content' : 'Uploaded documents'}" in Source Strategy first`
      )
      return
    }

    const previous = sources
    setSources((prev) =>
      prev.map((s) => (s.id === source.id ? { ...s, is_active: !s.is_active } : s))
    )

    try {
      const res = await fetch(`/api/clients/${clientId}/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !source.is_active }),
      })
      if (!res.ok) {
        setSources(previous)
        toast.error('Failed to update source')
      }
    } catch {
      setSources(previous)
      toast.error('Failed to update source')
    }
  }

  async function handleDelete(sourceId: string) {
    setSources((prev) => prev.filter((s) => s.id !== sourceId))
    try {
      const res = await fetch(`/api/clients/${clientId}/sources/${sourceId}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Failed to delete source')
      } else {
        toast.success('Source removed')
      }
    } catch {
      toast.error('Failed to delete source')
    }
  }

  return {
    sources,
    strategy,
    suggestions,
    isSaving,
    suggesting,
    savingStrategy,
    addingFromSuggestion,
    showModal,
    setShowModal,
    handleSaveStrategy,
    handleSuggest,
    handleAddSource,
    handleUploadFile,
    handleAddFromSuggestion,
    handleEditSource,
    handleToggleActive,
    handleDelete,
  }
}
