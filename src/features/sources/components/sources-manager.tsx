'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { PagePickerModal } from '@/features/sources/components/page-picker-modal'
import { ToggleRow } from '@/components/ui/form'
import { SourceRow } from '@/features/sources/components/source-row'
import { ManualAddInModal } from '@/features/sources/components/manual-add-modal'
import { extractInitials, formatRelativeTime } from '@/utils/format'
import { HeaderMeta, MetaFlag, PageHeader } from '@/components/layout/page-header/page-header'
import { useSources } from '@/features/sources/hooks/use-sources'
import { WHOLE_SITE_PAGE_CAP } from '@/features/sources/constants'
import { pillarHasSources, getSourcePillarIds } from '@/lib/clients/content-pillars'
import { toast } from '@/components/ui/toast'
import type { ClientSource, SourceStrategy } from '@/types/api'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { SourceUsageStats } from '@/lib/queries/db'

interface SourcesManagerProps {
  clientId: string
  clientName: string
  niche: string
  initialSources: ClientSource[]
  initialSourceStrategy?: SourceStrategy
  pillars: WeightedPillar[]
  usageStats?: SourceUsageStats[]
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
  initialSourceStrategy,
  pillars,
  usageStats,
}: SourcesManagerProps) {
  const {
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
  } = useSources({
    clientId,
    clientName,
    niche,
    pillarNames: pillars.map((p) => p.pillar),
    initialSources,
    initialSourceStrategy,
  })

  const [adding, setAdding] = useState<'rss' | 'website' | 'file' | null>(null)
  const [addForm, setAddForm] = useState<AddForm>({ label: '', url: '', focusInstructions: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Page picker state (shared between add + edit flows)
  const [pagePickerFor, setPagePickerFor] = useState<'add' | string | null>(null)
  const [discoveredPages, setDiscoveredPages] = useState<string[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [addSelectedPages, setAddSelectedPages] = useState<string[]>([])

  async function handleDiscoverPages(url: string, target: 'add' | string) {
    setDiscoverLoading(true)
    setDiscoveredPages([])
    setPagePickerFor(target)
    try {
      const res = await fetch('/api/sources/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = (await res.json()) as { pages: string[] }
      setDiscoveredPages(data.pages ?? [])
    } catch {
      toast.error('Failed to scan website')
      setDiscoveredPages([])
    } finally {
      setDiscoverLoading(false)
    }
  }

  async function onAddSource(type: 'rss' | 'website') {
    const ok = await handleAddSource(
      type,
      addForm.label,
      addForm.url,
      type === 'website'
        ? {
            focusInstructions: addForm.focusInstructions,
            selectedPages: addSelectedPages.length > 0 ? addSelectedPages : undefined,
          }
        : undefined
    )
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
    if (source.type === 'tavily') {
      return <span className="text-xs text-gray-400">Web research</span>
    }
    if (!source.last_fetch_status) {
      return <span className="text-xs text-gray-400">Never fetched</span>
    }
    if (source.last_fetch_status === 'ok') {
      const timeAgo = source.last_fetched_at
        ? formatRelativeTime(new Date(source.last_fetched_at))
        : ''
      return (
        <span className="text-xs text-green-600">✓ Working{timeAgo ? ` · ${timeAgo}` : ''}</span>
      )
    }
    return (
      <span className="text-xs text-red-500" title={source.last_fetch_error ?? undefined}>
        ⚠ Error
      </span>
    )
  }

  const usageBySourceId = new Map((usageStats ?? []).map((u) => [u.clientSourceId, u]))

  const rssSources = sources.filter((s) => s.type === 'rss')
  const websiteSources = sources.filter((s) => s.type === 'website')
  const fileSources = sources.filter((s) => s.type === 'file')
  const tavilySource = sources.find((s) => s.type === 'tavily')
  const activeSourceCount = sources.filter((s) => s.is_active).length
  const requireGrounding = strategy.require_source_grounding ?? false

  const allSourcePillarIds = sources
    .filter((s) => s.is_active)
    .map((s) => getSourcePillarIds(s.pillar_ids))
  const uncoveredPillars = pillars.filter((p) => !pillarHasSources(p.id, allSourcePillarIds))

  function renderSourceList(
    sourcesOfType: ClientSource[],
    emptyMessage: string,
    sourceType: 'rss' | 'website' | 'file',
    onScanPages?: (url: string, sourceId: string) => void
  ) {
    if (sourcesOfType.length === 0) {
      return adding === sourceType ? null : (
        <p className="text-sm text-gray-400 py-4">{emptyMessage}</p>
      )
    }
    return (
      <div className="flex flex-col gap-2">
        {sourcesOfType.map((source) => (
          <SourceRow
            key={source.id}
            source={source}
            statusBadge={getStatusBadge(source)}
            usage={usageBySourceId.get(source.id)}
            pillars={pillars}
            onPillarIdsChange={(ids) => {
              void handleEditSource(source.id, { pillar_ids: ids })
            }}
            onToggle={() => {
              void handleToggleActive(source)
            }}
            onEdit={(updates) => {
              void handleEditSource(source.id, updates)
            }}
            onDelete={() => {
              void handleDelete(source)
            }}
            onScanPages={onScanPages}
          />
        ))}
      </div>
    )
  }

  function renderLabelInput(placeholder: string) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gray-600">Label</label>
        <input
          type="text"
          value={addForm.label}
          onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
          placeholder={placeholder}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
        />
      </div>
    )
  }

  const pagePickerSource =
    pagePickerFor && pagePickerFor !== 'add'
      ? sources.find((s) => s.id === pagePickerFor)
      : undefined
  const pagePickerInitialSelected: string[] =
    pagePickerFor === 'add'
      ? addSelectedPages
      : (((pagePickerSource?.config as Record<string, unknown> | null)?.selected_pages as
          | string[]
          | undefined) ?? [])
  let pagePickerSiteOrigin = ''
  try {
    const rawUrl = pagePickerFor === 'add' ? addForm.url : pagePickerSource?.url
    if (rawUrl) pagePickerSiteOrigin = new URL(rawUrl).origin
  } catch {
    // A half-typed URL is normal here; the picker just opens without a site origin.
  }

  return (
    <>
      <PageHeader
        crumb={[
          { label: 'Clients', href: '/clients' },
          { label: clientName, href: `/clients/${clientId}/edit` },
          { label: 'Sources' },
        ]}
        back={`/clients/${clientId}/edit`}
        badge={extractInitials(clientName)}
        eyebrow="Content sources"
        title={clientName}
        count={sources.length}
        meta={
          <HeaderMeta
            parts={[
              'Drafts are grounded in what these sources publish',
              uncoveredPillars.length > 0 && (
                <MetaFlag>
                  {uncoveredPillars.length} pillar{uncoveredPillars.length === 1 ? '' : 's'} with no
                  source
                </MetaFlag>
              ),
            ]}
          />
        }
      />

      <div className="mx-auto max-w-2xl px-6 pb-10 pt-6">
        {/* Source settings */}
        <section className="mb-6 bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Source settings</p>
          <ToggleRow
            title="Strict mode: only use facts from these sources"
            description="When on, posts stick to facts found in your sources. Anything unverified gets flagged."
            checked={requireGrounding}
            onChange={(v) => {
              void handleToggleGrounding(v)
            }}
          />
        </section>

        {/* Topic-filter gaps (only meaningful once sources exist) */}
        {activeSourceCount > 0 && uncoveredPillars.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
            {uncoveredPillars.map((p) => (
              <p key={p.id} className="text-xs text-amber-700">
                No sources feed <span className="font-medium">&quot;{p.pillar}&quot;</span> right
                now. Ideas for this topic will come from web research and general knowledge instead.
              </p>
            ))}
          </div>
        )}

        {/* Research status */}
        <div className="mb-6">
          {requireGrounding && activeSourceCount === 0 ? (
            <p className="text-xs text-amber-600">
              Source grounding is on but no sources are active — disable grounding or activate a
              source.
            </p>
          ) : activeSourceCount === 0 ? (
            <p className="text-xs text-gray-500">
              No active sources — generation will have no source material.
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              {activeSourceCount} {activeSourceCount === 1 ? 'source' : 'sources'} active
            </p>
          )}
        </div>

        {/* Web research (Tavily) section */}
        {tavilySource && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Web research</h2>
            <SourceRow
              source={tavilySource}
              statusBadge={getStatusBadge(tavilySource)}
              usage={usageBySourceId.get(tavilySource.id)}
              pillars={pillars}
              onPillarIdsChange={(ids) => {
                void handleEditSource(tavilySource.id, { pillar_ids: ids })
              }}
              onToggle={() => {
                void handleToggleActive(tavilySource)
              }}
              onEdit={(updates) => {
                void handleEditSource(tavilySource.id, updates)
              }}
              onDelete={() => {
                void handleDelete(tavilySource)
              }}
            />
          </section>
        )}

        {/* News & blogs section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">News &amp; blogs</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                loading={suggesting}
                onClick={() => {
                  void handleSuggest()
                }}
              >
                Suggest feeds
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAdding('rss')
                  setAddForm({ label: '', url: '', focusInstructions: '' })
                }}
              >
                + Add feed
              </Button>
            </div>
          </div>

          {/* Inline add form */}
          {adding === 'rss' && (
            <div className="mb-3 p-4 rounded-xl border border-brand-purple/30 bg-brand-purple-light/30 flex flex-col gap-3">
              {renderLabelInput('e.g. Health News Daily')}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">Feed URL (RSS)</label>
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
                  onClick={() => {
                    void onAddSource('rss')
                  }}
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

          {renderSourceList(
            rssSources,
            'No feeds yet. Add a blog or news feed to pull fresh articles into your research.',
            'rss'
          )}
        </section>

        {/* Websites section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Websites</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAdding('website')
                setAddForm({ label: '', url: '', focusInstructions: '' })
              }}
            >
              + Add website URL
            </Button>
          </div>

          {/* Inline add form */}
          {adding === 'website' && (
            <div className="mb-3 p-4 rounded-xl border border-brand-purple/30 bg-brand-purple-light/30 flex flex-col gap-3">
              {renderLabelInput('e.g. diagnosa.info')}
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
                <label className="text-xs font-medium text-gray-600">
                  Focus instructions (optional)
                </label>
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
                    onClick={() => {
                      void handleDiscoverPages(addForm.url, 'add')
                    }}
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
                  onClick={() => {
                    void onAddSource('website')
                  }}
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

          {renderSourceList(
            websiteSources,
            "No websites yet. Add your client's website URL to use their content as research material.",
            'website',
            (url, sourceId) => {
              void handleDiscoverPages(url, sourceId)
            }
          )}
        </section>

        {/* Documents section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAdding('file')
                setAddForm({ label: '', url: '', focusInstructions: '' })
                setSelectedFile(null)
              }}
            >
              + Upload document
            </Button>
          </div>

          {/* Inline upload form */}
          {adding === 'file' && (
            <div className="mb-3 p-4 rounded-xl border border-brand-purple/30 bg-brand-purple-light/30 flex flex-col gap-3">
              {renderLabelInput('e.g. Service descriptions')}
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
                  onClick={() => {
                    void onUploadFile()
                  }}
                >
                  Upload & Extract
                </Button>
                <button
                  onClick={() => {
                    setAdding(null)
                    setSelectedFile(null)
                  }}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {renderSourceList(
            fileSources,
            'No documents yet. Upload PDFs or text files with client info the AI should reference.',
            'file'
          )}
        </section>

        {/* Page Picker Modal */}
        <PagePickerModal
          open={pagePickerFor !== null}
          onClose={() => setPagePickerFor(null)}
          pages={discoveredPages}
          loading={discoverLoading}
          initialSelected={pagePickerInitialSelected}
          siteOrigin={pagePickerSiteOrigin}
          onSave={(selected) => {
            // "Whole site" (nothing ticked) persists the discovered list, capped —
            // an empty selection would make research fetch only the homepage
            const pagesToSave =
              selected.length > 0 ? selected : discoveredPages.slice(0, WHOLE_SITE_PAGE_CAP)
            if (pagePickerFor === 'add') {
              setAddSelectedPages(pagesToSave)
            } else if (pagePickerFor) {
              const source = sources.find((s) => s.id === pagePickerFor)
              const config = { ...((source?.config as Record<string, unknown> | null) ?? {}) }
              delete config.selected_pages
              if (pagesToSave.length > 0) config.selected_pages = pagesToSave
              void handleEditSource(pagePickerFor, { config })
            }
            setPagePickerFor(null)
          }}
        />

        {/* Suggestion Modal */}
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={`Suggested news & blogs for ${niche || clientName}`}
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
                  className="p-3 rounded-lg border border-gray-200 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.label}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{s.url}</p>
                    <p className="text-xs text-gray-400 mt-1">{s.reason}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={addingFromSuggestion === s.url}
                    onClick={() => {
                      void handleAddFromSuggestion(s)
                    }}
                    className="shrink-0"
                  >
                    Add
                  </Button>
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
    </>
  )
}
