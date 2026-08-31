/** Client-side UI types for the public approval page. */

export type ApprovalPostStatus = 'pending' | 'approved' | 'changes_requested'

export type ApprovalFilter = 'all' | 'pending' | 'approved' | 'changes_requested'

/** Status color tokens used across approval page components. */
export const APPROVAL_STATUS_STYLES: Record<
  ApprovalPostStatus,
  { bg: string; color: string; label: string }
> = {
  pending: {
    bg: 'var(--pending-bg)',
    color: 'var(--pending)',
    label: 'Pending review',
  },
  approved: {
    bg: 'var(--wash)',
    color: 'var(--forest)',
    label: 'Approved',
  },
  changes_requested: {
    bg: 'var(--marker)',
    color: 'var(--forest-deep)',
    label: 'Feedback sent',
  },
}
