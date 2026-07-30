'use client'

import { Button } from '@/components/ui/button'

interface ReviewControlsProps {
  pendingCount: number
  approvedCount: number
  onApproveAll: () => void
}

/**
 * Queue counts and the approve-all action. Page-level controls: the shell
 * topbar owns the title, date chip and notifications.
 */
export function ReviewControls({ pendingCount, approvedCount, onApproveAll }: ReviewControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-2 md:px-[18px]">
      {pendingCount > 0 && (
        <span className="rounded-chip bg-pending-bg px-2 py-[3px] text-[10px] font-semibold text-pending">
          {pendingCount} pending
        </span>
      )}
      {approvedCount > 0 && (
        <span className="rounded-chip bg-wash px-2 py-[3px] text-[10px] font-semibold text-forest">
          {approvedCount} approved
        </span>
      )}

      <div className="ml-auto">
        <Button onClick={onApproveAll} disabled={pendingCount === 0} variant="secondary" size="sm">
          Approve all
        </Button>
      </div>
    </div>
  )
}
