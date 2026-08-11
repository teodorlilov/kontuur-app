'use client'

export const DISCARD_TOAST_MS = 7000

interface DiscardToastProps<T extends string> {
  title: string
  onUndo: () => void
  /**
   * Optional follow-up question. Omit for a plain undo window — the ideas inbox has
   * nothing to learn from a dismissal, so it asks nothing rather than showing chips
   * that feed no signal.
   */
  reasons?: {
    prompt: string
    hint?: string
    options: ReadonlyArray<{ id: T; label: string }>
    onPick: (id: T) => void
  }
}

/**
 * The undo window after a destructive action. Picking a reason commits immediately
 * with that signal; Undo reverses it; letting the toast expire commits without one.
 * Exactly one of the three happens — the caller guards it.
 *
 * Generic over the reason id so a caller keeps its own union end to end: the review
 * queue's `DiscardReason` reaches `onPick` un-widened, and this file never learns
 * what a discard reason is.
 */
export function DiscardToast<T extends string>({ title, onUndo, reasons }: DiscardToastProps<T>) {
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
      {reasons && (
        <>
          <p className="mt-2 text-caption text-text2">
            {reasons.prompt} {reasons.hint && <span className="text-text3">{reasons.hint}</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reasons.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => reasons.onPick(option.id)}
                className="rounded-chip border border-line2 px-2.5 py-1 text-caption font-medium text-ink transition-colors duration-150 ease-contour hover:bg-sunken"
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
