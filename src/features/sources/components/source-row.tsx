'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { truncateText } from '@/utils/format'
import { resolveEffectivePillarIds } from '@/lib/clients/content-pillars'
import { togglePillarAssignment } from '@/features/sources/lib/pillar-toggle'
import { PillarChip } from './pillar-chip'
import type { ClientSource } from '@/types/api'
import type { WeightedPillar } from '@/lib/clients/content-pillars'
import type { SourceUsageStats } from '@/lib/queries/db'

interface SourceRowProps {
  source: ClientSource
  statusBadge: React.ReactNode
  onToggle: () => void
  onEdit: (updates: { label?: string; url?: string; config?: Record<string, unknown> }) => void
  /** Omitted for web research: deleting that row turns the capability off permanently, because the
   *  section it lives in only renders when the row exists. */
  onDelete?: () => void
  onScanPages?: (url: string, sourceId: string) => void
  pillars?: WeightedPillar[]
  onPillarIdsChange?: (pillarIds: string[]) => void
  /** Outcome telemetry — renders "Fueled N posts" when this source has history. */
  usage?: SourceUsageStats
}

export function SourceRow({
  source,
  statusBadge,
  onToggle,
  onEdit,
  onDelete,
  onScanPages,
  pillars,
  onPillarIdsChange,
  usage,
}: SourceRowProps) {
  const [editing, setEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(source.label)
  const [editUrl, setEditUrl] = useState(source.url)
  const config = source.config as Record<string, unknown> | null
  const [editFocus, setEditFocus] = useState((config?.focus_instructions as string) ?? '')
  const selectedPages = (config?.selected_pages as string[] | undefined) ?? []

  const litPillarIds = pillars ? resolveEffectivePillarIds(source.pillar_ids, pillars) : []
  const feedsAll = litPillarIds.length === 0

  function handleSave() {
    const updates: { label?: string; url?: string; config?: Record<string, unknown> } = {}
    if (editLabel.trim() !== source.label) updates.label = editLabel.trim()
    if (editUrl.trim() !== source.url) updates.url = editUrl.trim()
    if (source.type === 'website') {
      const currentFocus = (config?.focus_instructions as string) ?? ''
      if (editFocus.trim() !== currentFocus) {
        updates.config = {
          ...config,
          focus_instructions: editFocus.trim() || undefined,
        }
      }
    }
    if (Object.keys(updates).length > 0) onEdit(updates)
    setEditing(false)
  }

  function handleCancel() {
    setEditLabel(source.label)
    setEditUrl(source.url)
    setEditFocus((config?.focus_instructions as string) ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="px-4 py-3 rounded-xl border border-line2 bg-wash flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-caption font-medium text-text2">Label</label>
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            className="rounded-lg border border-line2 px-3 py-1.5 text-lead md:text-body text-ink focus:border-spring focus:outline-none focus:ring-1 focus:ring-spring/12"
          />
        </div>
        {source.type !== 'file' && source.type !== 'tavily' && (
          <div className="flex flex-col gap-1">
            <label className="text-caption font-medium text-text2">URL</label>
            <input
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              className="rounded-lg border border-line2 px-3 py-1.5 text-lead md:text-body text-ink focus:border-spring focus:outline-none focus:ring-1 focus:ring-spring/12"
            />
          </div>
        )}
        {source.type === 'website' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-caption font-medium text-text2">
                Focus instructions (optional)
              </label>
              <textarea
                value={editFocus}
                onChange={(e) => setEditFocus(e.target.value)}
                placeholder="e.g. Property listings — prices, locations, sizes. Ignore navigation, filters."
                rows={2}
                className="rounded-lg border border-line2 px-3 py-1.5 text-lead md:text-body text-ink placeholder:text-text3 focus:border-spring focus:outline-none focus:ring-1 focus:ring-spring/12 resize-none"
              />
            </div>
            {onScanPages && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onScanPages(editUrl || source.url, source.id)}
                >
                  {selectedPages.length > 0 ? 'Rescan pages' : 'Scan for pages'}
                </Button>
                {selectedPages.length > 0 && (
                  <span className="text-caption text-forest font-medium">
                    {selectedPages.length} pages selected
                  </span>
                )}
              </div>
            )}
          </>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={
              !editLabel.trim() ||
              (source.type !== 'file' && source.type !== 'tavily' && !editUrl.trim())
            }
            onClick={handleSave}
          >
            Save
          </Button>
          <button onClick={handleCancel} className="text-body text-text3 hover:text-text2">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border bg-surface transition-opacity ${source.is_active ? 'border-line' : 'border-line opacity-50'}`}
    >
      <input
        type="checkbox"
        checked={source.is_active}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-line2 accent-forest cursor-pointer shrink-0"
        title={source.is_active ? 'Disable source' : 'Enable source'}
      />
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        <div className="flex items-center gap-2">
          <p className="text-body font-medium text-ink truncate">{source.label}</p>
          {selectedPages.length > 0 && (
            <span className="text-caption bg-wash text-forest px-1.5 py-0.5 rounded-full shrink-0">
              {selectedPages.length} pages
            </span>
          )}
        </div>
        {source.type !== 'tavily' && (
          <p className="text-caption text-text3 truncate">{truncateText(source.url, 60)}</p>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          {statusBadge}
          {usage && usage.approvedCount + usage.discardedCount > 0 && (
            <span
              className="text-caption text-text3"
              title={`${usage.approvedCount} approved · ${usage.discardedCount} discarded`}
            >
              · Fueled {usage.approvedCount} post{usage.approvedCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {pillars && pillars.length > 0 && onPillarIdsChange && (
          <div
            className="mt-2.5 border-t border-dashed border-line2 pt-2.5"
            // Chips are the control: every pillar shows lit or hollow, so the
            // feeds-all default is a visible state instead of popover fine print.
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-label font-semibold uppercase text-text3">Feeds</span>
              <span
                className={
                  feedsAll ? 'text-caption font-medium text-spring-text' : 'text-caption text-text3'
                }
              >
                {feedsAll
                  ? 'Feeds every pillar — including ones you add later'
                  : `Feeds ${litPillarIds.length} of ${pillars.length} pillars`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pillars.map((p) => (
                <PillarChip
                  key={p.id}
                  pillar={p.pillar}
                  lit={feedsAll || litPillarIds.includes(p.id)}
                  onToggle={() =>
                    onPillarIdsChange(togglePillarAssignment(source.pillar_ids, p.id, pillars))
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          className="text-text3 hover:text-danger transition-colors px-1 py-1 shrink-0"
          title="Remove source"
        >
          ✕
        </button>
      )}
    </div>
  )
}
