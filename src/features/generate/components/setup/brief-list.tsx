'use client'

import { useState } from 'react'
import { Plus, MessageSquare } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  CONTROL_SURFACE,
  CONTROL_FOCUS,
  CONTROL_TEXT,
  LABEL_CLASS,
} from '@/components/ui/form/control-classes'
import { PLATFORMS } from '@/utils/constants'
import type { PriorityPost } from '@/types/api'

const EMPTY_BRIEF: PriorityPost = { title: '', brief: '', platform: 'Instagram', targetDate: '' }

interface BriefListProps {
  briefs: PriorityPost[]
  onChange: (briefs: PriorityPost[]) => void
  /** An idea run shows its brief as a fixed row — it cannot be removed or added to. */
  lockedIdeaBrief?: { clientName: string; text: string }
}

/**
 * Priority briefs: campaigns and announcements written first, ahead of the
 * researched mix. A list of committed briefs plus a dashed add affordance that
 * opens an inline editor — same PriorityPost fields the stream payload takes.
 */
export function BriefList({ briefs, onChange, lockedIdeaBrief }: BriefListProps) {
  const [draft, setDraft] = useState<PriorityPost | null>(null)

  if (lockedIdeaBrief) {
    return (
      <div className="flex items-start gap-3 rounded-panel border border-line bg-sunken p-3">
        <span className="grid size-7 flex-none place-items-center rounded-chip bg-wash text-forest">
          <MessageSquare aria-hidden className="size-3.5" strokeWidth={1.6} />
        </span>
        <span className="min-w-0">
          <span className="block text-body font-medium text-ink">From idea</span>
          <span className="mt-0.5 line-clamp-2 block text-caption text-text2">
            “{lockedIdeaBrief.text}”
          </span>
        </span>
      </div>
    )
  }

  function commitDraft() {
    if (!draft || !draft.title.trim()) return
    onChange([...briefs, draft])
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {briefs.map((brief, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-chip border border-line bg-sunken px-3 py-2"
        >
          <span className="rounded-chip bg-marker px-2 py-0.5 text-micro font-medium text-forest-deep">
            Priority
          </span>
          <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
            {brief.title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-text2"
            onClick={() => onChange(briefs.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}

      {draft ? (
        <div className="flex flex-col gap-3 rounded-panel border border-line2 bg-surface p-4">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLASS.default}>Title</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Autumn retainer offer"
              className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'h-10 px-3')}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLASS.default}>Brief</span>
            <textarea
              value={draft.brief}
              onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
              rows={2}
              placeholder="What the post must say — the offer, the date, the angle"
              className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'resize-none px-3 py-2')}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-32">
              <Select
                label="Platform"
                value={draft.platform}
                onChange={(platform) => setDraft({ ...draft, platform })}
                options={PLATFORMS.map((p) => ({ value: p, label: p }))}
              />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS.default}>Target date — optional</span>
              <input
                type="date"
                value={draft.targetDate}
                onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })}
                className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'h-10 w-auto px-3')}
              />
            </label>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!draft.title.trim()} onClick={commitDraft}>
                Add brief
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY_BRIEF })}
          className="flex w-full items-start gap-3 rounded-panel border border-dashed border-line2 p-3 text-left transition-colors duration-150 ease-contour hover:border-forest hover:bg-wash"
        >
          <span className="grid size-7 flex-none place-items-center rounded-chip bg-wash text-forest">
            <Plus aria-hidden className="size-3.5" strokeWidth={1.6} />
          </span>
          <span>
            <span className="block text-body font-medium text-ink">
              Add a campaign or announcement
            </span>
            <span className="mt-0.5 block text-caption text-text2">
              Written first, ahead of the researched mix
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
