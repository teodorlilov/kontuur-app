'use client'

import Image from 'next/image'
import { cn } from '@/utils/cn'
import { formatRelativeTime, parseTimestamp, toPreviewLine } from '@/utils/format'
import type { CommentGroup, QueuedComment } from '@/types/api'

/**
 * One post and the comments waiting on it, as a row in the queue.
 *
 * Grouped by post rather than listed flat because a comment without the thing it
 * answers is half a sentence — and because four questions under one post are one
 * job, not four.
 */
export function PostGroup({
  group,
  comments,
  selectedCommentId,
  onSelect,
  now,
}: {
  group: CommentGroup
  /** Already filtered to the active tab — the group renders what it is given. */
  comments: QueuedComment[]
  selectedCommentId: string | null
  onSelect: (comment: QueuedComment, group: CommentGroup) => void
  now: Date
}) {
  const active = comments.some((comment) => comment.id === selectedCommentId)
  const shown = comments.length
  const total = group.comments.length

  return (
    <section
      className={cn(
        'rounded-card border bg-surface transition-colors duration-150 ease-contour',
        active ? 'border-forest' : 'border-ink/[0.05]'
      )}
    >
      <header className="flex items-center gap-3 border-b border-line px-3.5 py-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-sunken">
          {group.imageUrl && (
            <Image
              src={group.imageUrl}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
              unoptimized
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">
            {group.caption ? toPreviewLine(group.caption) : 'Untitled post'}
          </p>
          <p className="mt-px truncate text-micro text-text2">
            {group.clientName}
            {group.publishedAt &&
              ` · published ${formatRelativeTime(parseTimestamp(group.publishedAt), now)}`}
          </p>
        </div>
        {/* "1 of 4" rather than "4": the second number is why the list looks shorter
            than the post's comment count, which is otherwise read as a bug. */}
        <span className="shrink-0 text-micro tabular-nums text-text3">
          {shown} of {total}
        </span>
      </header>

      <ul>
        {comments.map((comment) => (
          <li key={comment.id}>
            <button
              type="button"
              onClick={() => onSelect(comment, group)}
              aria-current={comment.id === selectedCommentId}
              className={cn(
                'flex w-full cursor-pointer items-start gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 ease-contour',
                'hover:bg-sunken/60',
                comment.id === selectedCommentId && 'bg-sunken'
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-caption font-semibold text-ink">
                    {comment.authorUsername ? `@${comment.authorUsername}` : 'Someone'}
                  </span>
                  {comment.commentedAt && (
                    <span className="shrink-0 text-micro text-text3">
                      {formatRelativeTime(parseTimestamp(comment.commentedAt), now)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-body text-text2">
                  {comment.text ?? <em className="text-text3">Instagram withheld this comment</em>}
                </span>
              </span>
              {comment.status === 'needs_reply' && (
                <span
                  aria-label="Needs a reply"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
