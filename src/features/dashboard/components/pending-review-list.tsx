'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, CircleCheck } from 'lucide-react'
import { toast } from 'sonner'
import { updatePost } from '@/lib/actions/post-actions'
import { formatRelativeTime, parseTimestamp, toPreviewLine } from '@/utils/format'
import { hasCyrillic } from '@/lib/canvas/font-library'
import { cn } from '@/utils/cn'
import { COVERAGE_LIST_HEIGHT } from '@/features/dashboard/lib/layout'
import type { PendingPostPreview } from '@/features/dashboard/queries'

interface PendingReviewListProps {
  posts: PendingPostPreview[]
  totalPending: number
}

/** Scrollable review queue — approve without leaving the dashboard. */
export function PendingReviewList({ posts, totalPending }: PendingReviewListProps) {
  const [queue, setQueue] = useState(posts)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvedCount, setApprovedCount] = useState(0)
  const [serverTotal, setServerTotal] = useState(totalPending)
  const [, startTransition] = useTransition()

  // Approving runs a server action, which re-renders the route with a fresh
  // count. Adopt it and drop the optimistic offset, or the two subtract twice.
  if (totalPending !== serverTotal) {
    setServerTotal(totalPending)
    setApprovedCount(0)
    setQueue(posts)
  }

  const remaining = Math.max(totalPending - approvedCount, 0)
  const deeperInQueue = Math.max(remaining - queue.length, 0)

  /**
   * Approving queues the post for the publish cron under the client's name, so
   * it is the most consequential click on the dashboard. It stays one click —
   * but it is now reversible, and the toast holds the exit.
   */
  function handleApprove(post: PendingPostPreview, index: number) {
    setApprovingId(post.id)
    startTransition(async () => {
      const result = await updatePost(post.id, { status: 'approved' })
      if (!result.ok) {
        setApprovingId(null)
        toast.error(result.error)
        return
      }
      setApprovedCount((count) => count + 1)
      setQueue((prev) => prev.filter((item) => item.id !== post.id))
      setApprovingId(null)
      toast.success(`Approved — added to ${post.clientName}'s schedule`, {
        // Long enough to notice the row leave and change your mind.
        duration: 8000,
        action: { label: 'Undo', onClick: () => handleUndo(post, index) },
      })
    })
  }

  function handleUndo(post: PendingPostPreview, index: number) {
    startTransition(async () => {
      const result = await updatePost(post.id, { status: 'pending_review' })
      if (!result.ok) {
        toast.error(`Could not undo — ${result.error}`)
        return
      }
      setApprovedCount((count) => Math.max(count - 1, 0))
      // Back where it was, not on top: the queue is ordered, and a restored
      // post jumping to the front would misrepresent how long it has waited.
      setQueue((prev) =>
        prev.some((item) => item.id === post.id)
          ? prev
          : [...prev.slice(0, index), post, ...prev.slice(index)]
      )
      toast.success('Moved back to the review queue')
    })
  }

  return (
    <div className="rounded-card border border-ink/[0.05] bg-[image:var(--raised)] px-5 py-[18px] shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
          <span className="grid size-[27px] place-items-center rounded-sm bg-wash text-forest">
            <CircleCheck size={14} />
          </span>
          Pending review
        </span>
        <span className="rounded-full bg-wash px-2.5 py-[3px] text-[11.5px] font-semibold text-forest">
          {remaining} in queue
        </span>
      </div>

      <div
        className="mt-3 flex flex-col gap-2 overflow-y-auto pr-1"
        style={{ height: COVERAGE_LIST_HEIGHT }}
      >
        {queue.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5">
            <span className="grid size-11 place-items-center rounded-full bg-wash text-forest">
              <Check size={18} />
            </span>
            <span className="text-center font-display text-[15.5px] italic text-text2">
              All caught up — nothing waiting on you.
            </span>
          </div>
        ) : (
          queue.map((post, index) => (
            <PendingRow
              key={post.id}
              post={post}
              isApproving={approvingId === post.id}
              onApprove={() => handleApprove(post, index)}
            />
          ))
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11.5px] text-text3">
          {deeperInQueue > 0 ? `${deeperInQueue} more in the full queue` : ' '}
        </span>
        <Link
          href="/review"
          className="text-[12.5px] font-medium text-forest no-underline underline-offset-4 hover:underline"
        >
          Open full queue
        </Link>
      </div>
    </div>
  )
}

function PendingRow({
  post,
  isApproving,
  onApprove,
}: {
  post: PendingPostPreview
  isApproving: boolean
  onApprove: () => void
}) {
  // Spread, not slice(0,1): an emoji or any astral character is two code units,
  // and slicing one of them yields a broken glyph.
  const initial = [...post.clientName.trim()][0]?.toUpperCase() ?? '?'
  const preview = toPreviewLine(post.caption) || 'Untitled draft'

  return (
    <article
      className={cn(
        'group flex shrink-0 gap-3 rounded-panel border border-ink/[0.06] bg-surface p-2.5',
        'transition-[opacity,transform] duration-300 ease-contour',
        isApproving && 'translate-x-6 opacity-0'
      )}
    >
      {post.imageUrl ? (
        <Image
          src={post.imageUrl}
          alt=""
          width={44}
          height={44}
          className="size-[44px] shrink-0 rounded-sm object-cover"
        />
      ) : (
        <span
          className={cn(
            'grid h-[44px] w-[44px] shrink-0 place-items-center rounded-sm bg-wash text-[15px] text-forest',
            // Instrument Serif ships no Cyrillic, so a Bulgarian client's
            // initial would silently fall back to a mismatched system face.
            hasCyrillic(initial) ? 'font-sans font-medium not-italic' : 'font-display italic'
          )}
        >
          {initial}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 break-words text-[13px] font-medium leading-[1.4] text-ink">
          {preview}
        </p>
        <p className="mt-[3px] truncate text-[11.5px] text-text3">
          {[post.clientName, post.pillar || null, formatRelativeTime(parseTimestamp(post.createdAt))]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="flex shrink-0 flex-col justify-center gap-1">
        <button
          type="button"
          onClick={onApprove}
          disabled={isApproving}
          aria-busy={isApproving}
          // Every row's button reads "Approve"; without this a screen-reader
          // user tabbing the queue cannot tell which post they are approving.
          aria-label={`Approve post for ${post.clientName}`}
          className="rounded-full bg-forest px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-forest-deep disabled:opacity-50"
        >
          Approve
        </button>
        <Link
          href="/review"
          aria-label={`Open the review queue for ${post.clientName}`}
          className="rounded-full px-3 py-1 text-center text-[11.5px] font-medium text-text2 no-underline transition-colors hover:text-forest"
        >
          Open
        </Link>
      </div>
    </article>
  )
}
