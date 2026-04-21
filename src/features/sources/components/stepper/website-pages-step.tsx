'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { decodeUrl } from '@/utils/decode-url'

interface WebsitePagesStepProps {
  pages: string[]
  siteOrigin: string
  selectedPages: string[]
  onChange: (selected: string[]) => void
  onNext: () => void
  onBack: () => void
}

export function WebsitePagesStep({
  pages,
  siteOrigin,
  selectedPages,
  onChange,
  onNext,
  onBack,
}: WebsitePagesStepProps) {
  const [filter, setFilter] = useState('')
  const selected = new Set(selectedPages)

  const filteredPages = useMemo(() => {
    if (!filter.trim()) return pages
    const q = filter.toLowerCase()
    return pages.filter((url) => url.toLowerCase().includes(q))
  }, [pages, filter])

  function displayPath(url: string): string {
    try {
      const u = new URL(url)
      const raw = u.pathname + u.search
      return decodeUrl(raw)
    } catch {
      return url.replace(siteOrigin, '')
    }
  }

  function togglePage(url: string) {
    const next = new Set(selected)
    if (next.has(url)) next.delete(url)
    else next.add(url)
    onChange([...next])
  }

  function selectAllVisible() {
    const next = new Set(selected)
    for (const url of filteredPages) next.add(url)
    onChange([...next])
  }

  function deselectAll() {
    onChange([])
  }

  if (pages.length === 0) {
    return (
      <div className="space-y-5">
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">No pages found.</p>
          <p className="text-xs text-gray-400 mt-1">
            The sitemap may be empty or inaccessible.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          <Button size="sm" onClick={onNext}>
            Continue anyway
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Select pages</h3>
        <p className="text-sm text-gray-500 mt-1">
          Found {pages.length} pages on {siteOrigin.replace(/^https?:\/\//, '')}
        </p>
      </div>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter pages..."
        className="w-full px-3 py-2 text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={selectAllVisible}
          className="text-xs text-brand-purple hover:text-brand-purple-mid"
        >
          Select all ({filteredPages.length})
        </button>
        <span className="text-gray-300">·</span>
        <button
          type="button"
          onClick={deselectAll}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Deselect all
        </button>
      </div>

      <div className="max-h-[35vh] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
        {filteredPages.map((url) => (
          <label
            key={url}
            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(url)}
              onChange={() => togglePage(url)}
              className="h-4 w-4 rounded border-gray-300 accent-brand-purple cursor-pointer shrink-0"
            />
            <span className="text-sm text-gray-900 truncate" title={url}>
              {displayPath(url)}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          <span className="text-xs text-gray-500">{selected.size} pages selected</span>
        </div>
        <Button size="sm" onClick={onNext} disabled={selected.size === 0}>
          Continue
        </Button>
      </div>
    </div>
  )
}
