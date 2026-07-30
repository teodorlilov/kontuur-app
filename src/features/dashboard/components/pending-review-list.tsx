'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, CircleCheck } from 'lucide-react'
import { toast } from 'sonner'
import { updatePost } from '@/lib/actions/post-actions'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { PendingPostPreview } from '@/features/dashboard/queries'

/** Matches the coverage block's row area so the two columns line up. */
const SCROLL_HEIGHT = 240

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

  function handleApprove(post: PendingPostPreview) {
    setApprovingId(post.id)
    startTransition(async () => {
      const result = await updatePost(post.id, { status: 'approved' })
      if (!result.ok) {
        setApprovingId(null)
        toast.error(result.error)
        return
      }
      toast.success(`Approved — added to ${post.clientName}'s schedule`)
      setApprovedCount((count) => count + 1)
      setQueue((prev) => prev.filter((item) => item.id !== post.id))
      setApprovingId(null)
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
        style={{ height: SCROLL_HEIGHT }}
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
          queue.map((post) => (
            <PendingRow
              key={post.id}
              post={post}
              isApproving={approvingId === post.id}
              onApprove={() => handleApprove(post)}
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
        <span className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-sm bg-wash font-display text-[15px] italic text-forest">
          {post.clientName.slice(0, 1)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-medium leading-[1.4] text-ink">{post.caption}</p>
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
          className="rounded-full bg-forest px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-forest-deep disabled:opacity-50"
        >
          Approve
        </button>
        <Link
          href="/review"
          className="rounded-full px-3 py-1 text-center text-[11.5px] font-medium text-text2 no-underline transition-colors hover:text-forest"
        >
          Open
        </Link>
      </div>
    </article>
  )
}
