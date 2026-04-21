'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { truncateText } from '@/utils/format'
import { resolvePillarNames } from '@/lib/clients/content-pillars'
import { getPillarColor } from '@/components/ui/colors/pillar-colors'
import { PillarAssignmentPopover } from './pillar-assignment-popover'
import type { ClientSource } from '@/types/api'
import type { WeightedPillar } from '@/lib/clients/content-pillars'

interface SourceRowProps {
  source: ClientSource
  statusBadge: React.ReactNode
  onToggle: () => void
  onEdit: (updates: { label?: string; url?: string; config?: Record<string, unknown> }) => void
  onDelete: () => void
  onScanPages?: (url: string, sourceId: string, currentSelected: string[]) => void
  pillars?: WeightedPillar[]
  onPillarIdsChange?: (pillarIds: string[]) => void
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
}: SourceRowProps) {
  const [editing, setEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(source.label)
  const [editUrl, setEditUrl] = useState(source.url)
  const config = source.config as Record<string, unknown> | null
  const [editFocus, setEditFocus] = useState((config?.focus_instructions as string) ?? '')
  const selectedPages = (config?.selected_pages as string[] | undefined) ?? []

  const pillarNames = pillars ? resolvePillarNames(source.pillar_ids ?? [], pillars) : []

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
      <div className="px-4 py-3 rounded-xl border border-brand-purple/30 bg-brand-purple-light/30 flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Label</label>
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
          />
        </div>
        {source.type !== 'file' && source.type !== 'tavily' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">URL</label>
            <input
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple"
            />
          </div>
        )}
        {source.type === 'website' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">
                Focus instructions (optional)
              </label>
              <textarea
                value={editFocus}
                onChange={(e) => setEditFocus(e.target.value)}
                placeholder="e.g. Property listings — prices, locations, sizes. Ignore navigation, filters."
                rows={2}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple resize-none"
              />
            </div>
            {onScanPages && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onScanPages(editUrl || source.url, source.id, selectedPages)}
                >
                  {selectedPages.length > 0 ? 'Rescan pages' : 'Scan for pages'}
                </Button>
                {selectedPages.length > 0 && (
                  <span className="text-xs text-brand-purple font-medium">
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
            disabled={!editLabel.trim() || (source.type !== 'file' && source.type !== 'tavily' && !editUrl.trim())}
            onClick={handleSave}
          >
            Save
          </Button>
          <button onClick={handleCancel} className="text-sm text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-white transition-opacity ${source.is_active ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
      <input
        type="checkbox"
        checked={source.is_active}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-300 accent-brand-purple cursor-pointer shrink-0"
        title={source.is_active ? 'Disable source' : 'Enable source'}
      />
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{source.label}</p>
          {selectedPages.length > 0 && (
            <span className="text-xs bg-brand-purple-light text-brand-purple px-1.5 py-0.5 rounded-full shrink-0">
              {selectedPages.length} pages
            </span>
          )}
        </div>
        {source.type !== 'tavily' && (
          <p className="text-xs text-gray-400 truncate">{truncateText(source.url, 60)}</p>
        )}
        {pillars && pillarNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {pillarNames.map((name) => {
              const color = getPillarColor(name)
              return (
                <span
                  key={name}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color.bg} ${color.text}`}
                >
                  {name}
                </span>
              )
            })}
          </div>
        )}
        {pillars && pillarNames.length === 0 && (
          <p className="text-[10px] text-gray-400 mt-0.5">All pillars</p>
        )}
        <div className="mt-0.5">{statusBadge}</div>
      </div>
      {pillars && onPillarIdsChange && (
        <div className="shrink-0">
          <PillarAssignmentPopover
            pillars={pillars}
            assignedPillarIds={source.pillar_ids ?? []}
            onChange={onPillarIdsChange}
          />
        </div>
      )}
      <button
        onClick={onDelete}
        className="text-gray-400 hover:text-red-500 transition-colors px-1 py-1 shrink-0"
        title="Remove source"
      >
        ✕
      </button>
    </div>
  )
}
