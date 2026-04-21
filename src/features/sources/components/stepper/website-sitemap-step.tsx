'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { decodeUrl } from '@/utils/decode-url'
import { cn } from '@/utils/cn'

interface WebsiteSitemapStepProps {
  sitemaps: string[]
  websiteUrl: string
  onSelect: (sitemapUrl: string, pages: string[]) => void
  onSkipToPages: () => void
  onBack: () => void
}

export function WebsiteSitemapStep({
  sitemaps: rawSitemaps,
  websiteUrl,
  onSelect,
  onSkipToPages,
  onBack,
}: WebsiteSitemapStepProps) {
  const sitemaps = [...new Set(rawSitemaps)]
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function displaySitemapName(url: string): string {
    try {
      const pathname = new URL(url).pathname
      const name = pathname.split('/').pop() || pathname
      return decodeUrl(name)
    } catch {
      return url
    }
  }

  async function handleBrowse() {
    if (!selected) return
    setLoading(true)
    try {
      const res = await fetch('/api/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl, sitemapUrl: selected }),
      })
      const data = (await res.json()) as { pages?: string[] }
      onSelect(selected, data.pages ?? [])
    } catch {
      onSelect(selected, [])
    } finally {
      setLoading(false)
    }
  }

  if (sitemaps.length === 0) {
    return (
      <div className="space-y-5">
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">No sitemaps found on this website.</p>
          <p className="text-xs text-gray-400 mt-1">
            We&apos;ll use the pages discovered from the initial scan.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          <Button size="sm" onClick={onSkipToPages}>
            Continue with discovered pages
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Select a sitemap</h3>
        <p className="text-sm text-gray-500 mt-1">
          Found {sitemaps.length} sitemaps. Select one to browse its pages.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="md" />
          <p className="text-sm text-gray-500">Loading pages from sitemap...</p>
        </div>
      ) : (
        <div className="max-h-[40vh] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {sitemaps.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => setSelected(url)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors',
                selected === url
                  ? 'bg-brand-purple-light/40 border-l-2 border-l-brand-purple'
                  : 'hover:bg-gray-50'
              )}
            >
              <span className="text-sm font-medium text-gray-900">
                {displaySitemapName(url)}
              </span>
              <span className="text-xs text-gray-400 truncate ml-auto">{url}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          size="sm"
          onClick={() => { void handleBrowse() }}
          disabled={!selected || loading}
        >
          Browse pages
        </Button>
      </div>
    </div>
  )
}
