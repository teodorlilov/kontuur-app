'use client'

import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { postOrigin, postTitle } from '../lib/post-label'
import { namePlatforms } from '@/lib/validation'
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
        <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-sm bg-sunken">
          {group.imageUrl ? (
            <Image
              src={group.imageUrl}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
              unoptimized
            />
          ) : (
            // An icon, not an empty square: a bare grey box reads as an image that
            // failed to load rather than one we never had.
            <ImageOff size={14} aria-hidden="true" className="text-text3" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{postTitle(group)}</p>
          <p className="mt-px truncate text-micro text-text2">
            {[
              group.clientName,
              // Which network, beside whose account: two clients' worth of comments in one list
              // gave no way to tell a Page conversation from an Instagram one.
              namePlatforms([group.platform]),
              group.publishedAt &&
                `published ${formatRelativeTime(parseTimestamp(group.publishedAt), now)}`,
              postOrigin(group),
            ]
              .filter(Boolean)
              .join(' · ')}
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
