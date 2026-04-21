'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { updateClient } from '@/lib/actions/client-actions'
import { createSource, uploadSource, updateSource, deleteSource } from '@/lib/actions/source-actions'
import type { ActionResult } from '@/lib/actions/types'
import type { ClientSource, SourceSuggestion, SourceStrategy } from '@/types/api'

async function withRollback<T>(
  previous: T,
  restore: (v: T) => void,
  actionFn: () => Promise<ActionResult>,
  errorMessage: string
): Promise<boolean> {
  try {
    const result = await actionFn()
    if (!result.ok) {
      restore(previous)
      toast.error(result.error || errorMessage)
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
      () => updateClient(clientId, { brand_profile: { source_strategy: updated } }),
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
      const result = await createSource(clientId, {
        type,
        label: label.trim(),
        url: url.trim(),
        ...(type === 'website' ? {
          focusInstructions: options?.focusInstructions,
          selectedPages: options?.selectedPages,
        } : {}),
      })
      if (!result.ok) {
        toast.error(result.error)
        return false
      }
      setSources((prev) => [result.data.source, ...prev])
      if (result.data.fetchStatus === 'error') {
        toast.error('Source added but could not be reached — check the URL')
      } else {
        toast.success('Source added')
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

      const result = await uploadSource(clientId, formData)
      if (!result.ok) {
        toast.error(result.error)
        return false
      }
      setSources((prev) => [result.data, ...prev])
      toast.success('Document uploaded and text extracted')
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
      const result = await createSource(clientId, {
        type: 'rss',
        label: suggestion.label,
        url: suggestion.url,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSources((prev) => [result.data.source, ...prev])
      setSuggestions((prev) => prev.filter((s) => s.url !== suggestion.url))
      toast.success(`Added ${suggestion.label}`)
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
      () => updateSource(sourceId, updates),
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
      () => updateSource(source.id, { is_active: !source.is_active }),
      'Failed to update source'
    )
  }

  async function handleDelete(source: ClientSource) {
    const previous = sources
    setSources((prev) => prev.filter((s) => s.id !== source.id))
    const ok = await withRollback(previous, setSources,
      () => deleteSource(source.id),
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
