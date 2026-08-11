'use client'

import { useState } from 'react'
import { Plus, MessageSquare } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import { ChipGroup, Chip } from '@/components/ui/form'
import {
  CONTROL_SURFACE,
  CONTROL_FOCUS,
  CONTROL_TEXT,
  LABEL_CLASS,
} from '@/components/ui/form/control-classes'
import { PLATFORMS } from '@/utils/constants'
import type { PostType, PriorityPost } from '@/types/api'

const EMPTY_BRIEF: PriorityPost = { title: '', brief: '', targetDate: '', platform: '' }

/** Which brief the editor is open on. `index: null` is the one being added. */
interface EditorState {
  index: number | null
  value: PriorityPost
}

interface BriefListProps {
  briefs: PriorityPost[]
  onChange: (briefs: PriorityPost[]) => void
  /**
   * How many leading briefs are the client's own words rather than the agency's.
   * They render without a Remove control; everything after them behaves normally.
   */
  lockedCount?: number
  /** Carousel runs write one platform, so the per-brief override hides there. */
  postType: PostType
}

/**
 * Priority briefs: campaigns and announcements written first, ahead of the
 * researched mix. A list of committed briefs plus a dashed add affordance that
 * opens an inline editor — same PriorityPost fields the stream payload takes.
 *
 * Committed briefs are editable, including the locked one a client idea supplies.
 * They were frozen text before: only the draft being added had fields, so a brief
 * could be written once and never corrected, and the idea row could not be touched
 * at all. That mattered most for the case it blocked — planning refines a loose
 * idea's wording, but it cannot know which of two things an ambiguous one meant,
 * and this is the only point where a human can say. The edit shapes this run; the
 * client's submitted idea is not rewritten by it.
 */
export function BriefList({ briefs, onChange, lockedCount = 0, postType }: BriefListProps) {
  const [editor, setEditor] = useState<EditorState | null>(null)

  function commit() {
    if (!editor || !editor.value.title.trim()) return
    onChange(
      editor.index === null
        ? [...briefs, editor.value]
        : briefs.map((brief, i) => (i === editor.index ? editor.value : brief))
    )
    setEditor(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {briefs.map((brief, index) =>
        editor?.index === index ? (
          <BriefEditor
            key={index}
            state={editor}
            postType={postType}
            onChange={setEditor}
            onCancel={() => setEditor(null)}
            onSave={commit}
            saveLabel="Save brief"
          />
        ) : (
          <BriefRow
            key={index}
            brief={brief}
            locked={index < lockedCount}
            onEdit={() => setEditor({ index, value: brief })}
            onRemove={() => onChange(briefs.filter((_, i) => i !== index))}
          />
        )
      )}

      {editor?.index === null ? (
        <BriefEditor
          state={editor}
          postType={postType}
          onChange={setEditor}
          onCancel={() => setEditor(null)}
          onSave={commit}
          saveLabel="Add brief"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditor({ index: null, value: { ...EMPTY_BRIEF } })}
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

/**
 * A committed brief at rest.
 *
 * The sub-line exists because the row used to show the title alone, so the brief
 * body, platform and target date were invisible from the moment they were entered
 * until generation consumed them.
 */
function BriefRow({
  brief,
  locked,
  onEdit,
  onRemove,
}: {
  brief: PriorityPost
  locked: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const details = [brief.platform, brief.targetDate && `due ${brief.targetDate}`, brief.brief]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex items-center gap-3 rounded-chip border border-line bg-sunken px-3 py-2">
      <span className="inline-flex flex-none items-center gap-1.5 rounded-chip bg-marker px-2 py-0.5 text-micro font-medium text-forest-deep">
        {locked && <MessageSquare aria-hidden className="size-3" strokeWidth={1.8} />}
        {locked ? 'From idea' : 'Priority'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{brief.title}</span>
        {details && <span className="block truncate text-caption text-text3">{details}</span>}
      </span>
      <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit brief: ${brief.title}`}>
        Edit
      </Button>
      {!locked && (
        <Button variant="ghost" size="sm" className="text-text2" onClick={onRemove}>
          Remove
        </Button>
      )}
    </div>
  )
}

/** The brief form, shared by adding one and correcting one. */
function BriefEditor({
  state,
  postType,
  onChange,
  onCancel,
  onSave,
  saveLabel,
}: {
  state: EditorState
  postType: PostType
  onChange: (next: EditorState) => void
  onCancel: () => void
  onSave: () => void
  saveLabel: string
}) {
  const set = (patch: Partial<PriorityPost>) =>
    onChange({ ...state, value: { ...state.value, ...patch } })

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line2 bg-surface p-4">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS.default}>Title</span>
        <input
          value={state.value.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Autumn retainer offer"
          className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'h-10 px-3')}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS.default}>Brief</span>
        <textarea
          value={state.value.brief}
          onChange={(e) => set({ brief: e.target.value })}
          rows={2}
          placeholder="What the post must say — the offer, the date, the angle"
          className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'resize-none px-3 py-2')}
        />
      </label>
      {/* Hidden for carousels: postType is run-level and carousel ⇒ Instagram is
          the app's own rule, so a per-brief override would promise a mix the run
          cannot deliver. */}
      {postType !== 'carousel' && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL_CLASS.default}>Platform — optional</span>
          <ChipGroup label="Platform for this post">
            {PLATFORMS.map((p) => (
              <Chip
                key={p}
                pressed={p === state.value.platform}
                // Toggle semantics from the public idea form: clicking the pressed
                // chip clears back to '' — inherit the run platform.
                onClick={() => set({ platform: p === state.value.platform ? '' : p })}
              >
                {p}
              </Chip>
            ))}
          </ChipGroup>
          <span className="text-caption text-text2">
            {state.value.platform
              ? `Overrides the run platform for this post.`
              : 'Uses the run platform unless you pick one.'}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL_CLASS.default}>Target date — optional</span>
          <input
            type="date"
            value={state.value.targetDate}
            onChange={(e) => set({ targetDate: e.target.value })}
            className={cn(CONTROL_SURFACE, CONTROL_FOCUS, CONTROL_TEXT, 'h-10 w-auto px-3')}
          />
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!state.value.title.trim()} onClick={onSave}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
