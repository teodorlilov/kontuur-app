'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageGroupList } from '@/features/sources/components/page-group-list'

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

  function handleToggle(urls: string[], nextChecked: boolean) {
    const next = new Set(selected)
    for (const url of urls) {
      if (nextChecked) next.add(url)
      else next.delete(url)
    }
    onChange([...next])
  }

  if (pages.length === 0) {
    return (
      <div className="space-y-5">
        <div className="text-center py-6">
          <p className="text-body text-text3">We couldn&apos;t find pages automatically.</p>
          <p className="text-caption text-text3 mt-1">
            You can still use the site&apos;s homepage as a source.
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
        <h3 className="font-sans text-display font-medium text-ink">Choose what we read</h3>
        <p className="text-body text-text3 mt-1">
          Found {pages.length} pages on {siteOrigin.replace(/^https?:\/\//, '')}. Pick the sections
          worth reading — or use the whole site.
        </p>
      </div>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter pages..."
        className="w-full px-3 py-2 text-lead md:text-body text-ink placeholder:text-text3 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-line2"
      />

      <PageGroupList
        pages={pages}
        selected={selected}
        onToggle={handleToggle}
        siteOrigin={siteOrigin}
        filter={filter}
      />

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          <span className="text-caption text-text3">
            {selected.size === 0 ? 'Whole site' : `${selected.size} pages selected`}
          </span>
        </div>
        <Button size="sm" onClick={onNext}>
          {selected.size === 0 ? 'Use whole site' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
