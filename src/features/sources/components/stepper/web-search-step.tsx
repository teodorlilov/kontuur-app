'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import type { ClientSource } from '@/types/api'
import type { TavilyConfig } from '@/types/sources'

interface WebSearchStepProps {
  clientId: string
  enabled: boolean
  includeDomains: string[]
  excludeDomains: string[]
  onConfigChange: (config: {
    enabled: boolean
    includeDomains: string[]
    excludeDomains: string[]
  }) => void
  onSourceCreated: (id: string) => void
  onNext: () => void
  onBack: () => void
}

function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^www\./, '')
  d = d.replace(/\/.*$/, '')
  return d
}

export function WebSearchStep({
  clientId,
  enabled,
  includeDomains,
  excludeDomains,
  onConfigChange,
  onSourceCreated,
  onNext,
  onBack,
}: WebSearchStepProps) {
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [includes, setIncludes] = useState<string[]>(includeDomains)
  const [excludes, setExcludes] = useState<string[]>(excludeDomains)
  const [includeInput, setIncludeInput] = useState('')
  const [excludeInput, setExcludeInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Pre-populate from existing tavily source if one exists
  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/sources`)
      if (!res.ok) return
      const data = (await res.json()) as { sources?: ClientSource[] }
      const tavily = data.sources?.find((s) => s.type === 'tavily')
      if (tavily) {
        setIsEnabled(tavily.is_active)
        const cfg = tavily.config as TavilyConfig | undefined
        if (cfg?.include_domains?.length) setIncludes(cfg.include_domains)
        if (cfg?.exclude_domains?.length) setExcludes(cfg.exclude_domains)
      }
    } catch {
      // ignore — will use defaults
    } finally {
      setLoaded(true)
    }
  }, [clientId])

  useEffect(() => {
    void loadExisting()
  }, [loadExisting])

  function addDomain(
    input: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void
  ) {
    const domain = normalizeDomain(input)
    if (!domain || list.includes(domain)) {
      setInput('')
      return
    }
    setList([...list, domain])
    setInput('')
  }

  function removeDomain(domain: string, list: string[], setList: (v: string[]) => void) {
    setList(list.filter((d) => d !== domain))
  }

  async function handleContinue() {
    setSaving(true)
    try {
      const config: TavilyConfig = {}
      if (includes.length > 0) config.include_domains = includes
      if (excludes.length > 0) config.exclude_domains = excludes

      const res = await fetch(`/api/clients/${clientId}/sources/tavily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isEnabled, config }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error ?? 'Failed to save web search settings')
        return
      }
      const data = (await res.json()) as { source?: { id: string } }
      if (data.source?.id) onSourceCreated(data.source.id)
      onConfigChange({
        enabled: isEnabled,
        includeDomains: includes,
        excludeDomains: excludes,
      })
      onNext()
    } catch {
      toast.error('Failed to save web search settings')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-4 py-6">
        <p className="text-sm text-gray-500 animate-pulse">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Web Search</h3>
        <p className="text-sm text-gray-500 mt-1">
          Search the web for trending content and industry news.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => setIsEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
        />
        <span className="text-sm font-medium text-gray-900">Enable web search</span>
      </label>

      {isEnabled && (
        <div className="space-y-4">
          {/* Include domains */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">
              Preferred domains <span className="text-gray-400">(optional)</span>
            </label>
            <p className="text-xs text-gray-400">
              Only return results from these domains.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={includeInput}
                onChange={(e) => setIncludeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addDomain(includeInput, includes, setIncludes, setIncludeInput)
                  }
                }}
                placeholder="e.g. example.com"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addDomain(includeInput, includes, setIncludes, setIncludeInput)}
                disabled={!includeInput.trim()}
              >
                Add
              </Button>
            </div>
            {includes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {includes.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => removeDomain(d, includes, setIncludes)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Exclude domains */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">
              Excluded domains <span className="text-gray-400">(optional)</span>
            </label>
            <p className="text-xs text-gray-400">
              Never return results from these domains.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addDomain(excludeInput, excludes, setExcludes, setExcludeInput)
                  }
                }}
                placeholder="e.g. competitor.com"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addDomain(excludeInput, excludes, setExcludes, setExcludeInput)}
                disabled={!excludeInput.trim()}
              >
                Add
              </Button>
            </div>
            {excludes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {excludes.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-50 text-red-700"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => removeDomain(d, excludes, setExcludes)}
                      className="text-red-400 hover:text-red-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={() => { void handleContinue() }} loading={saving}>
          Continue
        </Button>
      </div>
    </div>
  )
}
