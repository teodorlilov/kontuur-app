'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { cn } from '@/utils/cn'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { postOrigin, postTitle } from '../lib/post-label'
import { namePlatforms } from '@/lib/validation'
import type { CommentGroup, QueuedComment } from '@/types/api'

/**
 * The right pane: the post, the comment being answered, and the composer.
 *
 * The composer sits INSIDE the comment it answers rather than at the foot of the
 * pane. With one box at the bottom, a thread with three questions gives no answer
 * to "which of these am I replying to" — and the study found that is where every
 * flat inbox loses people.
 */
export function CommentThread({
  group,
  comment,
  accountName,
  now,
  onReply,
  onToggleHidden,
  onDelete,
  pending,
}: {
  group: CommentGroup
  comment: QueuedComment
  /** The handle the reply will be posted as, shown so nobody has to guess. */
  accountName: string | null
  now: Date
  onReply: (message: string) => Promise<boolean>
  onToggleHidden: () => void
  onDelete: () => void
  pending: boolean
}) {
  const [message, setMessage] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const origin = postOrigin(group)
  // Named once, used by the chip and the outbound link — which said "Open on Instagram" over a
  // Facebook permalink, sending people to the wrong network's name for their own post.
  const network = namePlatforms([group.platform])

  async function submit() {
    const trimmed = message.trim()
    if (!trimmed) return
    const sent = await onReply(trimmed)
    if (sent) setMessage('')
  }

  return (
    <aside
      aria-label="Selected comment"
      className="overflow-hidden rounded-card border border-ink/[0.05] bg-surface"
    >
      {/* Only when there is one. An empty square the width of the pane is a large
          blank claiming to be a picture. */}
      {group.imageUrl && (
        <div className="relative aspect-square w-full bg-sunken">
          <Image
            src={group.imageUrl}
            alt=""
            fill
            sizes="316px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      <div className="border-b border-line px-3.5 py-3">
        {group.caption ? (
          <p className="line-clamp-4 text-caption leading-relaxed text-text2">{group.caption}</p>
        ) : (
          <p className="text-caption leading-relaxed text-text3">{postTitle(group)}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill tone="neutral">{network}</StatusPill>
          {group.pillar && <StatusPill tone="neutral">{group.pillar}</StatusPill>}
          {group.publishedAt && (
            <StatusPill tone="neutral">
              Published {formatRelativeTime(parseTimestamp(group.publishedAt), now)}
            </StatusPill>
          )}
          {origin && <StatusPill tone="neutral">{origin}</StatusPill>}
        </div>
      </div>

      <div className="px-3.5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-caption font-semibold text-ink">
            {comment.authorUsername ? `@${comment.authorUsername}` : 'Someone'}
          </span>
          {comment.commentedAt && (
            <span className="text-micro text-text3">
              {formatRelativeTime(parseTimestamp(comment.commentedAt), now)}
            </span>
          )}
          {comment.hidden && (
            <span className="ml-auto">
              <StatusPill tone="warn">Hidden</StatusPill>
            </span>
          )}
        </div>
        <p className="mt-1 text-body leading-relaxed text-ink">
          {comment.text ?? (
            <em className="text-text3">
              Instagram withheld the text of this comment. It will appear once the app has Advanced
              Access.
            </em>
          )}
        </p>

        {comment.replies.length > 0 && (
          <ul className="mt-3 space-y-2 border-l-2 border-line pl-3">
            {comment.replies.map((reply) => (
              <li key={reply.id}>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'truncate text-micro font-semibold',
                      reply.fromUs ? 'text-forest' : 'text-ink'
                    )}
                  >
                    {reply.authorUsername ? `@${reply.authorUsername}` : 'Someone'}
                  </span>
                  {reply.commentedAt && (
                    <span className="text-micro text-text3">
                      {formatRelativeTime(parseTimestamp(reply.commentedAt), now)}
                    </span>
                  )}
                </div>
                <p className="text-caption leading-relaxed text-text2">{reply.text}</p>
              </li>
            ))}
          </ul>
        )}

        <label className="mt-3 block">
          <span className="sr-only">Your reply</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            maxLength={2200}
            placeholder={accountName ? `Reply as @${accountName}…` : 'Write a reply…'}
            className={cn(
              'w-full resize-none rounded-sm border border-line2 bg-paper px-2.5 py-2',
              'text-body text-ink placeholder:text-text3',
              'focus:border-forest focus:outline-none'
            )}
          />
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={submit} disabled={pending || message.trim().length === 0}>
            Reply
          </Button>
          <Button size="sm" variant="secondary" onClick={onToggleHidden} disabled={pending}>
            {comment.hidden ? 'Unhide' : 'Hide'}
          </Button>
          {/* Two steps, and hide offered first. Deleting is the only irreversible
              thing on this page, and Instagram gives nothing back. */}
          {confirmingDelete ? (
            <>
              <Button size="sm" variant="danger" onClick={onDelete} disabled={pending}>
                Delete for good
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {group.permalink && (
        <div className="border-t border-line px-3.5 py-2.5">
          <a
            href={group.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-caption text-text2 hover:text-forest"
          >
            Open on {network}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      )}
    </aside>
  )
}
