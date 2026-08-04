'use client'

import { DISCARD_REASONS, DISCARD_REASON_LABELS, type DiscardReason } from '@/features/review/lib/discard-reasons'

export const DISCARD_TOAST_MS = 7000

interface DiscardToastProps {
  title: string
  onUndo: () => void
  onReason: (reason: DiscardReason) => void
}

/**
 * The undo window after a discard. Picking a reason commits immediately with
 * that signal; Undo restores the post; letting the toast expire commits
 * without a reason. Exactly one of the three happens — the caller guards it.
 */
export function DiscardToast({ title, onUndo, onReason }: DiscardToastProps) {
  return (
    <div className="w-[356px] rounded-card border border-line bg-surface p-4 shadow-pop">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-body font-semibold text-ink">{title}</p>
        <button
          type="button"
          onClick={onUndo}
          className="flex-none text-caption font-semibold text-spring-text hover:underline"
        >
          Undo
        </button>
      </div>
      <p className="mt-2 text-caption text-text2">
        Why didn&apos;t it work?{' '}
        <span className="text-text3">Optional — teaches next week&apos;s generation.</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DISCARD_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => onReason(reason)}
            className="rounded-chip border border-line2 px-2.5 py-1 text-caption font-medium text-ink transition-colors duration-150 ease-contour hover:bg-sunken"
          >
            {DISCARD_REASON_LABELS[reason]}
          </button>
        ))}
      </div>
    </div>
  )
}
