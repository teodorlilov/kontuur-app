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
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        fontWeight: 500,
        color: isApproved ? '#5A8A4A' : '#2C5F8A',
      }}
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
    <div
      style={{
        padding: '12px 22px',
        background: '#fff',
        borderTop: '0.5px solid rgba(44,62,80,0.07)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {status !== 'pending' && <StatusMessage status={status} />}

      {status === 'pending' && (
        <>
          <button
            onClick={onRequestChanges}
            disabled={isSubmitting}
            style={{
              padding: '10px 18px',
              background: '#F0EDE8',
              border: '1px solid #D4CEC7',
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 500,
              color: '#3A4A54',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isSubmitting ? 0.7 : 1,
              transition: 'all 0.15s',
            }}
          >
            <MessageCircle size={12} />
            Request changes
          </button>

          <button
            onClick={onApprove}
            disabled={isSubmitting}
            style={{
              padding: '10px 20px',
              background: '#5A8A4A',
              color: '#fff',
              border: 'none',
              borderRadius: 9,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isSubmitting ? 0.7 : 1,
              transition: 'all 0.15s',
            }}
          >
            <Check size={12} />
            Approve this post
          </button>
        </>
      )}

      {totalPending > 0 && (
        <button
          onClick={onApproveAll}
          disabled={isSubmitting}
          style={{
            padding: '10px 20px',
            background: '#1A2630',
            color: '#ECE8E1',
            border: 'none',
            borderRadius: 9,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginLeft: 'auto',
            transition: 'background 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Approve all {totalPending} posts →
        </button>
      )}
    </div>
  )
}
