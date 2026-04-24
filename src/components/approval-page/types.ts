/** Client-side UI types for the public approval page. */

export type ApprovalPostStatus = 'pending' | 'approved' | 'changes_requested'

export type ApprovalFilter = 'all' | 'pending' | 'approved' | 'changes_requested'

/** Status color tokens used across approval page components. */
export const APPROVAL_STATUS_STYLES: Record<
  ApprovalPostStatus,
  { bg: string; color: string; label: string }
> = {
  pending: {
    bg: 'rgba(192,123,85,0.10)',
    color: '#C07B55',
    label: 'Pending review',
  },
  approved: {
    bg: 'rgba(90,138,74,0.10)',
    color: '#5A8A4A',
    label: 'Approved',
  },
  changes_requested: {
    bg: 'rgba(44,94,138,0.10)',
    color: '#2C5F8A',
    label: 'Feedback sent',
  },
}
