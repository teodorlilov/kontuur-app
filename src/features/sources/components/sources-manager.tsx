'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { PagePickerModal } from '@/features/sources/components/page-picker-modal'
import { StrategyToggle } from '@/features/sources/components/strategy-toggle'
import { SourceRow } from '@/features/sources/components/source-row'
import { ManualAddInModal } from '@/features/sources/components/manual-add-modal'
import { cn } from '@/utils/cn'
import { formatRelativeTime } from '@/utils/format'
import { useSources } from '@/features/sources/hooks/use-sources'
import { toast } from '@/components/ui/toast'
import type { ClientSource, SourceSuggestion } from '@/types/api'

interface SourcesManagerProps {
  clientId: string
  clientName: string
  niche: string
  initialSources: ClientSource[]
  isOnboarding: boolean
  initialSourceStrategy?: {
    rss: boolean
    website: boolean
    file: boolean
    trend_fallback: boolean
    require_source_grounding?: boolean
  }
}

interface AddForm {
  label: string
  url: string
  focusInstructions: string
}

export function SourcesManager({
  clientId,
  clientName,
  niche,
  initialSources,
  isOnboarding,
  initialSourceStrategy,
}: SourcesManagerProps) {
  const {
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
  } = useSources({ clientId, clientName, niche, initialSources, isOnboarding, initialSourceStrategy })

  const [adding, setAdding] = useState<'rss' | 'website' | 'file' | null>(null)
  const [addForm, setAddForm] = useState<AddForm>({ label: '', url: '', focusInstructions: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Page picker state (shared between add + edit flows)
  const [pagePickerFor, setPagePickerFor] = useState<'add' | string | null>(null)
  const [discoveredPages, setDiscoveredPages] = useState<string[]>([])
  const [discoveredSitemaps, setDiscoveredSitemaps] = useState<string[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [sitemapLoading, setSitemapLoading] = useState(false)
  const [addSelectedPages, setAddSelectedPages] = useState<string[]>([])

  async function handleDiscoverPages(url: string, target: 'add' | string, initialSelected: string[] = []) {
    setDiscoverLoading(true)
    setDiscoveredPages([])
    setDiscoveredSitemaps([])
    setPagePickerFor(target)
    try {
      const res = await fetch('/api/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json() as { pages: string[]; sitemaps?: string[] }
      if (data.sitemaps && data.sitemaps.length > 0) {
        setDiscoveredSitemaps(data.sitemaps)
        setDiscoveredPages([])
      } else {
        setDiscoveredPages(data.pages ?? [])
        setDiscoveredSitemaps([])
      }
    } catch {
      toast.error('Failed to scan website')
      setDiscoveredPages([])
      setDiscoveredSitemaps([])
    } finally {
      setDiscoverLoading(false)
    }
  }

  async function handleSelectSitemap(sitemapUrl: string) {
    const url = pagePickerFor === 'add'
      ? addForm.url
      : sources.find((s) => s.id === pagePickerFor)?.url
    if (!url) return

    setSitemapLoading(true)
    try {
      const res = await fetch('/api/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, sitemapUrl }),
      })
      const data = await res.json() as { pages: string[] }
      setDiscoveredPages(data.pages ?? [])
    } catch {
      toast.error('Failed to load sitemap pages')
      setDiscoveredPages([])
    } finally {
      setSitemapLoading(false)
    }
  }

  async function onAddSource(type: 'rss' | 'website') {
    const ok = await handleAddSource(type, addForm.label, addForm.url, type === 'website' ? {
      focusInstructions: addForm.focusInstructions,
      selectedPages: addSelectedPages.length > 0 ? addSelectedPages : undefined,
    } : undefined)
    if (ok) {
      setAdding(null)
      setAddForm({ label: '', url: '', focusInstructions: '' })
      setAddSelectedPages([])
    }
  }

  async function onUploadFile() {
    if (!selectedFile || !addForm.label.trim()) return
    const ok = await handleUploadFile(selectedFile, addForm.label)
    if (ok) {
      setAdding(null)
      setAddForm({ label: '', url: '', focusInstructions: '' })
      setSelectedFile(null)
    }
  }

  function getStatusBadge(source: ClientSource) {
    if (source.type === 'file') {
      return <span className="text-xs text-green-600">Uploaded</span>
    }
    if (!source.last_fetch_status) {
      return <span className="text-xs text-gray-400">Never fetched</span>
    }
    if (source.last_fetch_status === 'ok') {
      const timeAgo = source.last_fetched_at
        ? formatRelativeTime(new Date(source.last_fetched_at))
        : ''
      return (
        <span className="text-xs text-green-600">
          ✓ Working{timeAgo ? ` · ${timeAgo}` : ''}
        </span>
      )
    }
    return (
      <span className="text-xs text-red-500" title={source.last_fetch_error ?? undefined}>
        ⚠ Error
      </span>
    )
  }

  const rssSources = sources.filter((s) => s.type === 'rss')
  const websiteSources = sources.filter((s) => s.type === 'website')
  const fileSources = sources.filter((s) => s.type === 'file')

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <a href={`/clients/${clientId}/edit`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to {clientName}
        </a>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--color-text-1)', letterSpacing: '-0.02em', margin: '12px 0 0' }}>Research Sources</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sources are fetched during the research step to suggest post themes grounded in real content.
        </p>
      </div>

      {/* Source strategy toggles */}
      <section className="mb-8 bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Source strategy</p>
          {savingStrategy && <span className="text-xs text-gray-400">Saving...</span>}
        </div>
        <p className="text-xs text-gray-500">Control which source types the AI uses during research.</p>
        <div className="flex flex-col gap-2.5">
          <StrategyToggle
            label="RSS feeds"
            enabled={strategy.rss}
            onChange={(v) => { void handleSaveStrategy({ ...strategy, rss: v }) }}
          />
          <StrategyToggle
            label="Website content"
            enabled={strategy.website}
            onChange={(v) => { void handleSaveStrategy({ ...strategy, website: v }) }}
          />
          <StrategyToggle
            label="Uploaded documents"
            enabled={strategy.file}
            onChange={(v) => { void handleSaveStrategy({ ...strategy, file: v }) }}
          />
          <StrategyToggle
            label="Trend-based research"
            description="Suggest themes based on niche trends when no source content is available"
            enabled={strategy.trend_fallback}
            onChange={(v) => { void handleSaveStrategy({ ...strategy, trend_fallback: v }) }}
          />
          <StrategyToggle
            label="Require source grounding"
            description="Posts will only use facts from your sources. Ungrounded claims are flagged."
            enabled={strategy.require_source_grounding ?? false}
            onChange={(v) => { void handleSaveStrategy({ ...strategy, require_source_grounding: v }) }}
          />
        </div>
      </section>

      {/* Onboarding banner */}
      {isOnboarding && (
        <div className="bg-brand-purple-light border border-brand-purple/20 rounded-xl p-4 mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-purple">Set up research sources</p>
            <p className="text-xs text-brand-purple/70 mt-0.5">
              Add RSS feeds or your client&apos;s website so research is grounded in their real content.
            </p>
          </div>
          <a href="/clients" className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap mt-0.5">
            Skip for now →
          </a>
        </div>
      )}

      {/* RSS Feeds section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">RSS Feeds</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              loading={suggesting}
              onClick={() => { void handleSuggest() }}
            >
              Suggest feeds
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setAdding('rss'); setAddForm({ label: '', url: '', focusInstructions: '' }) }}
            >
              + Add RSS feed
            </Button>
          </div>
        </div>

        {/* Inline add form */}
        {adding === 'rss' && (
          <div className="mb-3 p-4 rounded-xl border border-brand-purple/30 bg-brand-purple-light/30 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">Label</label>
              <input
                type="text"
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Health News Daily"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">RSS Feed URL</label>
              <input
                type="url"
                value={addForm.url}
                onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://example.com/feed"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={isSaving}
                disabled={!addForm.label.trim() || !addForm.url.trim()}
                onClick={() => { void onAddSource('rss') }}
              >
                Add & Test
              </Button>
              <button
                onClick={() => setAdding(null)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Source list */}
        {rssSources.length === 0 && adding !== 'rss' ? (
          <p className="text-sm text-gray-400 py-4">
            No RSS feeds yet. Add a feed URL to pull recent articles into your research.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rssSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                statusBadge={getStatusBadge(source)}
                onToggle={() => { void handleToggleActive(source) }}
                onEdit={(updates) => { void handleEditSource(source.id, updates) }}
                onDelete={() => { void handleDelete(source.id) }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Websites section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Websites</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setAdding('website'); setAddForm({ label: '', url: '', focusInstructions: '' }) }}
          >
            + Add website URL
          </Button>
        </div>

        {/* Inline add form */}
        {adding === 'website' && (
          <div className="mb-3 p-4 rounded-xl border border-brand-purple/30 bg-brand-purple-light/30 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">Label</label>
              <input
                type="text"
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. diagnosa.info"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">Website URL</label>
              <input
                type="url"
                value={addForm.url}
                onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://example.com"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">Focus instructions (optional)</label>
              <textarea
                value={addForm.focusInstructions}
                onChange={(e) => setAddForm((f) => ({ ...f, focusInstructions: e.target.value }))}
                placeholder="e.g. Property listings — prices, locations, sizes. Ignore navigation, filters, search forms."
                rows={2}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple resize-none"
              />
              <p className="text-xs text-gray-400">
                Tell the AI what to extract from this page. Leave empty to use all content.
              </p>
            </div>
            {addForm.url.trim() && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!addForm.url.trim()}
                  onClick={() => { void handleDiscoverPages(addForm.url, 'add', addSelectedPages) }}
                >
                  Scan for pages
                </Button>
                {addSelectedPages.length > 0 && (
                  <span className="text-xs text-brand-purple font-medium">
                    {addSelectedPages.length} pages selected
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={isSaving}
                disabled={!addForm.label.trim() || !addForm.url.trim()}
                onClick={() => { void onAddSource('website') }}
              >
                Add & Test
              </Button>
              <button
                onClick={() => setAdding(null)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Source list */}
        {websiteSources.length === 0 && adding !== 'website' ? (
          <p className="text-sm text-gray-400 py-4">
            No websites yet. Add your client&apos;s website URL to use their content as research material.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {websiteSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                statusBadge={getStatusBadge(source)}
                onToggle={() => { void handleToggleActive(source) }}
                onEdit={(updates) => { void handleEditSource(source.id, updates) }}
                onDelete={() => { void handleDelete(source.id) }}
                onScanPages={(url, sourceId, currentSelected) => {
                  void handleDiscoverPages(url, sourceId, currentSelected)
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Documents section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setAdding('file'); setAddForm({ label: '', url: '', focusInstructions: '' }); setSelectedFile(null) }}
          >
            + Upload document
          </Button>
        </div>

        {/* Inline upload form */}
        {adding === 'file' && (
          <div className="mb-3 p-4 rounded-xl border border-brand-purple/30 bg-brand-purple-light/30 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">Label</label>
              <input
                type="text"
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Service descriptions"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600">File (PDF or TXT)</label>
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
              />
            </div>
            <p className="text-xs text-gray-500">
              Max 10MB. Text will be extracted and used as context for research and generation.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                loading={isSaving}
                disabled={!addForm.label.trim() || !selectedFile}
                onClick={() => { void onUploadFile() }}
              >
                Upload & Extract
              </Button>
              <button
                onClick={() => { setAdding(null); setSelectedFile(null) }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* File source list */}
        {fileSources.length === 0 && adding !== 'file' ? (
          <p className="text-sm text-gray-400 py-4">
            No documents yet. Upload PDFs or text files with client info the AI should reference.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {fileSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                statusBadge={getStatusBadge(source)}
                onToggle={() => { void handleToggleActive(source) }}
                onEdit={(updates) => { void handleEditSource(source.id, updates) }}
                onDelete={() => { void handleDelete(source.id) }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Onboarding CTA */}
      {isOnboarding && (
        <div className="border border-brand-purple/20 rounded-xl p-6 bg-brand-purple-light/40 text-center">
          <p className="text-sm font-medium text-gray-900">
            {sources.length > 0
              ? 'Sources are set up — you\'re ready to generate content!'
              : 'You can always add sources later from the client settings.'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {sources.length > 0
              ? 'Research will pull from your sources to suggest relevant themes.'
              : 'Without sources, research will suggest themes based on trending topics in your niche.'}
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <a href="/generate">
              <Button size="sm">Generate content →</Button>
            </a>
            <a
              href="/clients"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Go to clients
            </a>
          </div>
        </div>
      )}

      {/* Page Picker Modal */}
      <PagePickerModal
        open={pagePickerFor !== null}
        onClose={() => { setPagePickerFor(null); setDiscoveredSitemaps([]) }}
        pages={discoveredPages}
        sitemaps={discoveredSitemaps}
        loading={discoverLoading}
        sitemapLoading={sitemapLoading}
        initialSelected={pagePickerFor === 'add' ? addSelectedPages : (() => {
          const source = sources.find((s) => s.id === pagePickerFor)
          return ((source?.config as Record<string, unknown> | null)?.selected_pages as string[] | undefined) ?? []
        })()}
        siteOrigin={(() => {
          try {
            const url = pagePickerFor === 'add' ? addForm.url : sources.find((s) => s.id === pagePickerFor)?.url
            return url ? new URL(url).origin : ''
          } catch { return '' }
        })()}
        onSave={(selected) => {
          if (pagePickerFor === 'add') {
            setAddSelectedPages(selected)
          } else if (pagePickerFor) {
            const source = sources.find((s) => s.id === pagePickerFor)
            const currentConfig = (source?.config as Record<string, unknown> | null) ?? {}
            void handleEditSource(pagePickerFor, {
              config: { ...currentConfig, selected_pages: selected },
            })
          }
          setPagePickerFor(null)
        }}
        onSelectSitemap={handleSelectSitemap}
      />

      {/* Suggestion Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={`Suggested RSS feeds for ${niche || clientName}`}
        className="max-w-xl"
      >
        {suggesting ? (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-sm text-gray-500">Finding relevant feeds...</p>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            No suggestions found. Add a feed URL manually below.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
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
                      <span className="text-xs text-green-600 shrink-0">✓ Valid</span>
                    ) : (
                      <span className="text-xs text-gray-400 shrink-0" title={s.error}>
                        ✗ Unreachable
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{s.url}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.reason}</p>
                </div>
                {s.valid && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={addingFromSuggestion === s.url}
                    onClick={() => { void handleAddFromSuggestion(s) }}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Manual add fallback */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Add a feed URL manually:</p>
          <ManualAddInModal
            onAdd={(label, url) => {
              void handleAddSource('rss', label, url).then((ok) => {
                if (ok && suggestions.length === 0) setShowModal(false)
              })
            }}
            isSaving={isSaving}
          />
        </div>
      </Modal>
    </div>
  )
}
