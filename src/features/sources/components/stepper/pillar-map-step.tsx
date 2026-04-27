'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { updateSource } from '@/features/sources/actions/source-actions'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { ClientSource } from '@/types/api'

interface AssignPillarsStepProps {
  clientId: string
  pillars: WeightedPillar[]
  createdSourceIds?: string[]
  onNext: () => void
  onBack: () => void
}

/** Fetches all sources for the client and lets the user assign pillars to each. */
export function AssignPillarsStep({
  clientId,
  pillars,
  createdSourceIds = [],
  onNext,
  onBack,
}: AssignPillarsStepProps) {
  const [sources, setSources] = useState<ClientSource[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [assignments, setAssignments] = useState<Map<string, string[]>>(new Map())
  const [saving, setSaving] = useState(false)

  const loadSources = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const res = await fetch(`/api/clients/${clientId}/sources`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = (await res.json()) as { sources?: ClientSource[] }
      const fetched = data.sources ?? []
      setSources(fetched)
      // Initialize assignments from existing pillar_ids
      const initial = new Map<string, string[]>()
      for (const s of fetched) {
        initial.set(s.id, s.pillar_ids ?? [])
      }
      setAssignments(initial)
    } catch {
      setSources([])
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  function togglePillar(sourceId: string, pillarId: string) {
    setAssignments((prev) => {
      const next = new Map(prev)
      const current = next.get(sourceId) ?? []
      if (current.includes(pillarId)) {
        next.set(sourceId, current.filter((id) => id !== pillarId))
      } else {
        next.set(sourceId, [...current, pillarId])
      }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all(
        sources.map((s) => {
          const newIds = assignments.get(s.id) ?? []
          const oldIds = s.pillar_ids ?? []
          if (JSON.stringify(newIds.sort()) === JSON.stringify(oldIds.sort())) return null
          return updateSource(s.id, { pillar_ids: newIds })
        })
      )
      onNext()
    } catch {
      // continue anyway
      onNext()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 py-6">
        <p className="text-sm text-gray-500 animate-pulse">Loading sources...</p>
      </div>
    )
  }

  if (sources.length === 0) {
    // If we know sources were created but fetch failed, show retry
    if (fetchError && createdSourceIds.length > 0) {
      return (
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            Could not load sources. Check your connection and try again.
          </p>
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => { void loadSources() }}>
                Retry
              </Button>
              <Button size="sm" onClick={onNext}>Skip</Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-5">
        <p className="text-sm text-gray-500">No sources created yet. You can assign pillars later from the sources page.</p>
        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
          <Button size="sm" onClick={onNext}>Continue</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Assign pillars to sources</h3>
        <p className="text-sm text-gray-500 mt-1">
          Choose which pillars each source should feed. Unassigned sources feed all pillars.
        </p>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto">
        {sources.map((source) => {
          const sourceIds = assignments.get(source.id) ?? []
          return (
            <div key={source.id} className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-900">{source.label}</p>
              <p className="text-xs text-gray-400 mb-2">
                {source.type === 'tavily' ? 'Web search' : source.url}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pillars.map((p) => {
                  const color = getPillarColor(p.pillar)
                  const selected = sourceIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePillar(source.id, p.id)}
                      className={`text-xs px-2 py-1 rounded-full font-medium border transition-colors ${
                        selected
                          ? `${color.bg} ${color.text} border-current`
                          : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {p.pillar}
                    </button>
                  )
                })}
              </div>
              {sourceIds.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1">All pillars</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>Back</Button>
        <Button size="sm" onClick={() => { void handleSave() }} loading={saving}>
          Save & continue
        </Button>
      </div>
    </div>
  )
}
