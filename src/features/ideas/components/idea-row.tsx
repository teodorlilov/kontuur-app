'use client'

import { ActionLink } from '@/components/ui/action-link'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { IdeaDueChip } from './idea-due-chip'
import { IDEA_GRID, IDEA_GRID_DROP } from './grid'
import { formatRelativeTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { ClientIdea } from '@/types/api'
import { generatedPostWasDeleted } from '@/features/ideas/lib/idea-filters'

interface IdeaRowProps {
  idea: ClientIdea
  /** Pinned by the server, so every chip on the page ages from one instant. */
  now: Date
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onDismiss: () => void
  onRestore: () => void
}

/** One idea in the inbox: what it says, when it is due, and the one thing to do about it. */
export function IdeaRow({
  idea,
  now,
  selected,
  onToggleSelect,
  onOpen,
  onDismiss,
  onRestore,
}: IdeaRowProps) {
  const unread = !idea.readAt

  return (
    <tr
      className={cn(
        IDEA_GRID,
        'min-h-13 border-t border-line py-2 transition-colors duration-150 ease-contour',
        selected ? 'bg-wash' : 'hover:bg-sunken'
      )}
    >
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          // Labelled by the idea itself rather than "Select row 3": the text is what
          // the user is deciding about, and row numbers change under every filter.
          aria-label={`Select: ${idea.ideaText}`}
          className="size-3.5 accent-forest"
        />
      </td>

      <td className="flex min-w-0 items-start gap-2">
        {unread ? (
          <span className="mt-1.75 size-1.5 flex-none rounded-full bg-spring-text">
            <span className="sr-only">Unread</span>
          </span>
        ) : (
          // Holds the column so read and unread rows align on the same text edge.
          <span className="mt-1.75 size-1.5 flex-none" aria-hidden />
        )}
        <span className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              'block w-full truncate text-left text-body text-ink',
              'rounded-xs hover:underline focus-visible:outline focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-spring',
              unread && 'font-medium'
            )}
          >
            {idea.ideaText}
          </button>
          {idea.extraNotes && (
            <span className="mt-0.5 block truncate text-caption text-text3">{idea.extraNotes}</span>
          )}
        </span>
      </td>

      <td className={IDEA_GRID_DROP}>
        {idea.platform && <StatusPill tone="ok">{idea.platform}</StatusPill>}
      </td>

      <td className={IDEA_GRID_DROP}>
        {idea.targetDate && <IdeaDueChip targetDate={idea.targetDate} now={now} />}
      </td>

      <td className="text-micro tabular-nums text-text3">
        {formatRelativeTime(new Date(idea.submittedAt), now)}
      </td>

      <td className="flex items-center justify-end gap-1.5">
        {generatedPostWasDeleted(idea) ? (
          // Say what happened and give the way back. Without this branch the row rendered nothing
          // at all — see generatedPostWasDeleted.
          <>
            <span className="text-micro text-text3">Post deleted</span>
            <ActionLink href={`/generate?ideaId=${idea.id}`} size="sm">
              Generate again
            </ActionLink>
          </>
        ) : idea.status === 'generated' ? (
          // The one reader of generated_post_id, which has been written, selected and
          // mapped since the feature shipped and displayed by nothing.
          idea.generatedPostId && (
            <ActionLink
              href={`/calendar?editPost=${idea.generatedPostId}`}
              variant="secondary"
              size="sm"
            >
              View post
              <span aria-hidden>&rarr;</span>
            </ActionLink>
          )
        ) : idea.status === 'dismissed' ? (
          <Button variant="ghost" size="sm" onClick={onRestore}>
            Restore
          </Button>
        ) : (
          <>
            <ActionLink href={`/generate?ideaId=${idea.id}`} size="sm">
              Generate
            </ActionLink>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </>
        )}
      </td>
    </tr>
  )
}
