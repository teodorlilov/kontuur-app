'use client'

import { Button } from '@/components/ui/button'

interface CommitmentBarProps {
  approvedCount: number
  totalCount: number
  liveCount: number
  failedVisuals: number
  composingVisuals: number
  approving: boolean
  /** Surface-specific quiet actions before Skip (the queue adds Send to client). */
  leadingActions?: React.ReactNode
  onSkip: () => void
  onDiscard: () => void
  onApproveAll: () => void
  onApproveNext: () => void
}

/**
 * The focus layout's decision surface — always on screen, so the approve
 * decision lives in exactly one place. One primary: Approve & next. Skip
 * defers, Discard rejects, Approve all is the bulk escape.
 */
export function CommitmentBar({
  approvedCount,
  totalCount,
  liveCount,
  failedVisuals,
  composingVisuals,
  approving,
  leadingActions,
  onSkip,
  onDiscard,
  onApproveAll,
  onApproveNext,
}: CommitmentBarProps) {
  const notes = [
    failedVisuals > 0 ? `${failedVisuals} visual${failedVisuals === 1 ? '' : 's'} failed` : null,
    composingVisuals > 0 ? `${composingVisuals} still composing` : null,
  ].filter(Boolean)

  return (
    <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-panel border border-ink/[0.05] bg-surface px-4 py-3 shadow-pop">
      <p className="min-w-[140px] flex-1 text-caption text-text2">
        <span className="font-semibold tabular-nums text-ink">
          {approvedCount} of {totalCount} approved
        </span>
        {notes.length > 0 && <span> · {notes.join(' · ')}</span>}
      </p>
      {leadingActions}
      <Button variant="ghost" size="sm" className="text-text2" onClick={onSkip}>
        Skip
      </Button>
      {/* Destructive beside ordinary actions: Clay on approach, not at rest. */}
      <Button
        variant="ghost"
        size="sm"
        className="text-text2 hover:bg-danger-bg hover:text-danger"
        onClick={onDiscard}
      >
        Discard
      </Button>
      <Button variant="secondary" size="sm" disabled={approving} onClick={onApproveAll}>
        Approve all {liveCount}
      </Button>
      <Button size="sm" loading={approving} onClick={onApproveNext}>
        Approve &amp; next
      </Button>
    </div>
  )
}
