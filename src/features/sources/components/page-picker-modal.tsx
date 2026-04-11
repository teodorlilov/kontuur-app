'use client'

import { useState, useMemo, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { decodeUrl } from '@/utils/decode-url'

type ModalStep = 'sitemaps' | 'pages'

interface PagePickerModalProps {
  open: boolean
  onClose: () => void
  pages: string[]
  sitemaps: string[]
  loading: boolean
  sitemapLoading: boolean
  initialSelected: string[]
  siteOrigin: string
  onSave: (selected: string[]) => void
  onSelectSitemap: (sitemapUrl: string) => void
}

export function PagePickerModal({
  open,
  onClose,
  pages,
  sitemaps,
  loading,
  sitemapLoading,
  initialSelected,
  siteOrigin,
  onSave,
  onSelectSitemap,
}: PagePickerModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  const [filter, setFilter] = useState('')
  const [step, setStep] = useState<ModalStep>(sitemaps.length > 0 ? 'sitemaps' : 'pages')

  // Transition to pages step when pages arrive after sitemap selection
  useEffect(() => {
    if (sitemaps.length > 0 && pages.length === 0 && !sitemapLoading) {
      setStep('sitemaps')
    }
    if (pages.length > 0) {
      setStep('pages')
    }
  }, [sitemaps, pages, sitemapLoading])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setSelected(new Set(initialSelected))
      setFilter('')
    }
  }, [open, initialSelected])

  const filteredPages = useMemo(() => {
    if (!filter.trim()) return pages
    const q = filter.toLowerCase()
    return pages.filter((url) => url.toLowerCase().includes(q))
  }, [pages, filter])

  function togglePage(url: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const url of filteredPages) next.add(url)
      return next
    })
  }

  function deselectAll() {
    setSelected(new Set())
  }

  function displayPath(url: string): string {
    try {
      const u = new URL(url)
      const raw = u.pathname + u.search
      return decodeUrl(raw)
    } catch {
      return url.replace(siteOrigin, '')
    }
  }

  function displaySitemapName(url: string): string {
    try {
      const pathname = new URL(url).pathname
      const name = pathname.split('/').pop() || pathname
      return decodeUrl(name)
    } catch {
      return url
    }
  }

  function handleBackToSitemaps() {
    setStep('sitemaps')
    setFilter('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'sitemaps' ? 'Select a sitemap' : 'Select pages'}
      className="max-w-xl"
    >
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="md" />
          <p className="text-sm text-gray-500">Scanning website for sitemaps...</p>
        </div>
      ) : step === 'sitemaps' ? (
        /* ---- Sitemap selection step ---- */
        sitemapLoading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner size="md" />
            <p className="text-sm text-gray-500">Loading pages from sitemap...</p>
          </div>
        ) : sitemaps.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">No sitemaps found on this website.</p>
            <p className="text-xs text-gray-400 mt-1">
              The site may not have a sitemap or accessible links.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">
              Found {sitemaps.length} sitemaps on {siteOrigin.replace(/^https?:\/\//, '')}. Select
              one to browse its pages.
            </p>

            <div className="max-h-[40vh] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
              {sitemaps.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => onSelectSitemap(url)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {displaySitemapName(url)}
                  </span>
                  <span className="text-xs text-gray-400 truncate ml-auto">{url}</span>
                </button>
              ))}
            </div>

            <div className="flex justify-end mt-4">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )
      ) : pages.length === 0 ? (
        /* ---- No pages found ---- */
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">No pages found on this website.</p>
          <p className="text-xs text-gray-400 mt-1">
            The site may not have a sitemap or accessible links.
          </p>
          {sitemaps.length > 0 && (
            <button
              type="button"
              onClick={handleBackToSitemaps}
              className="text-xs text-brand-purple hover:text-brand-purple-mid mt-3"
            >
              ← Back to sitemaps
            </button>
          )}
        </div>
      ) : (
        /* ---- Page selection step ---- */
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600">
              Found {pages.length} pages on {siteOrigin.replace(/^https?:\/\//, '')}
            </p>
            {sitemaps.length > 0 && (
              <button
                type="button"
                onClick={handleBackToSitemaps}
                className="text-xs text-brand-purple hover:text-brand-purple-mid"
              >
                ← Back to sitemaps
              </button>
            )}
          </div>

          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter pages..."
            className="w-full px-3 py-2 text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple mb-3"
          />

          <div className="flex items-center gap-3 mb-3">
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

          <div className="max-h-[40vh] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
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

          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-500">{selected.size} pages selected</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => onSave([...selected])}
                disabled={selected.size === 0}
              >
                Save selection
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
