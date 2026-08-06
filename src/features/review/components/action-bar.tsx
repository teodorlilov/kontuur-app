'use client'

import { Check, MessageCircle } from 'lucide-react'
import type { ApprovalPostStatus } from './types'

interface ActionBarProps {
  status: ApprovalPostStatus
  totalPending: number
  onApprove: () => void
  onRequestChanges: () => void
  onApproveAll: () => void
  isSubmitting: boolean
}

/** Status message shown after a post has been acted on. */
function StatusMessage({ status }: { status: 'approved' | 'changes_requested' }) {
  const isApproved = status === 'approved'
  return (
    <div
      className="flex flex-1 items-center gap-2 text-caption font-medium"
      style={{ color: isApproved ? 'var(--spring-text)' : 'var(--forest)' }}
    >
      {isApproved ? <Check size={14} /> : <MessageCircle size={14} />}
      {isApproved
        ? 'This post has been approved'
        : 'Feedback sent — waiting for the agency to update'}
    </div>
  )
}

/** Bottom action bar with per-post approve/request-changes and batch approve-all. */
export function ActionBar({
  status,
  totalPending,
  onApprove,
  onRequestChanges,
  onApproveAll,
  isSubmitting,
}: ActionBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-ink/7 bg-surface px-[22px] py-3">
      {status !== 'pending' && <StatusMessage status={status} />}

      {status === 'pending' && (
        <>
          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-[9px] border border-line2 bg-sunken px-[18px] py-2.5 text-caption font-medium text-text2 transition-all duration-150 ease-[ease]"
            onClick={onRequestChanges}
            disabled={isSubmitting}
            style={{ opacity: isSubmitting ? 0.7 : 1 }}
          >
            <MessageCircle size={12} />
            Request changes
          </button>

          <button
            className="flex cursor-pointer items-center gap-1.5 rounded-[9px] border-0 bg-spring px-5 py-2.5 text-caption font-medium text-white transition-all duration-150 ease-[ease]"
            onClick={onApprove}
            disabled={isSubmitting}
            style={{ opacity: isSubmitting ? 0.7 : 1 }}
          >
            <Check size={12} />
            Approve this post
          </button>
        </>
      )}

      {totalPending > 0 && (
        <button
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-[9px] border-0 bg-forest-deep px-5 py-2.5 text-caption font-medium text-ink-inv transition-[background] duration-150 ease-[ease]"
          onClick={onApproveAll}
          disabled={isSubmitting}
        >
          Approve all {totalPending} posts →
        </button>
      )}
    </div>
  )
}
