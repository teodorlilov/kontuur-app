'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, CircleCheck } from 'lucide-react'
import { toast } from 'sonner'
import { updatePost } from '@/lib/actions/post-actions'
import { formatRelativeTime, parseTimestamp } from '@/utils/format'
import { cn } from '@/utils/cn'
import { Button } from '@/components/ui/button'
import type { PendingPostPreview } from '@/features/dashboard/queries'

/** Depth transforms for the three visible cards. */
const DEPTH_CLASSES = [
  'z-30',
  'z-20 translate-y-[13px] scale-[0.965] opacity-55',
  'z-10 translate-y-[26px] scale-[0.93] opacity-30',
]

interface ReviewStackProps {
  posts: PendingPostPreview[]
  totalPending: number
}

/** Approve the newest drafts without leaving the dashboard. */
export function ReviewStack({ posts, totalPending }: ReviewStackProps) {
  const [stack, setStack] = useState(posts)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [approvedCount, setApprovedCount] = useState(0)
  const [isPending, startTransition] = useTransition()

  const remaining = Math.max(totalPending - approvedCount, 0)
  const deeperInQueue = Math.max(remaining - stack.length, 0)

  function handleApprove(post: PendingPostPreview) {
    setLeavingId(post.id)
    startTransition(async () => {
      const result = await updatePost(post.id, { status: 'approved' })
      if (!result.ok) {
        setLeavingId(null)
        toast.error(result.error)
        return
      }
      toast.success(`Approved — added to ${post.clientName}'s schedule`)
      setApprovedCount((count) => count + 1)
      setStack((prev) => prev.filter((item) => item.id !== post.id))
      setLeavingId(null)
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

      <div className="relative mt-[18px] h-[152px]">
        {stack.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5">
            <span className="grid size-11 place-items-center rounded-full bg-wash text-forest">
              <Check size={18} />
            </span>
            <span className="text-center font-display text-[15.5px] italic text-text2">
              {deeperInQueue > 0
                ? `All caught up here — ${deeperInQueue} more in the full queue.`
                : 'All caught up — nothing waiting on you.'}
            </span>
          </div>
        ) : (
          stack.slice(0, 3).map((post, index) => (
            <article
              key={post.id}
              className={cn(
                'absolute inset-x-0 top-0 rounded-panel border border-ink/[0.07] bg-surface px-3.5 py-3.5',
                'shadow-[0_12px_28px_-12px_rgba(15,21,18,0.15)]',
                'transition-[transform,opacity] duration-[450ms] ease-contour',
                DEPTH_CLASSES[index],
                leavingId === post.id && 'translate-x-20 rotate-[2.5deg] opacity-0'
              )}
            >
              <div className="flex gap-3">
                <span className="grid h-[42px] w-[34px] shrink-0 place-items-center rounded-sm bg-wash font-display text-[15px] italic text-forest">
                  {post.clientName.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-medium leading-[1.45] text-ink">
                    {post.caption}
                  </p>
                  <p className="mt-[3px] text-[11.5px] text-text3">
                    {[post.clientName, post.pillar || null, formatRelativeTime(parseTimestamp(post.createdAt))]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>

              {index === 0 && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-full"
                    disabled={isPending}
                    onClick={() => handleApprove(post)}
                  >
                    Approve
                  </Button>
                  {/* A link, not a mutation: there is no agency-side
                      "request changes" path — feedback comes from the client. */}
                  <Link
                    href="/review"
                    className="inline-flex items-center rounded-full px-3.5 py-2 text-[13px] font-medium text-forest no-underline transition-colors hover:bg-wash"
                  >
                    Open in review
                  </Link>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <div className="mt-3 flex justify-end">
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
