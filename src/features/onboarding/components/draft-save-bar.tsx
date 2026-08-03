'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { useUnloadGuard } from '@/hooks/use-unload-guard'

interface DraftSaveBarProps {
  visible: boolean
  /** Fields the site could not answer that the user has not resolved yet. */
  openAsks: number
  /** Names what is still missing, e.g. "Post goal". Present means Save is blocked. */
  blockedBy?: string
  /** Blank-form mode reports progress instead, since nothing was drafted to check. */
  manual?: boolean
  filled?: number
  total?: number
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onJumpToAsk: () => void
}

/**
 * The floating commit bar for a drafted client.
 *
 * Separate from `components/ui/form/save-bar.tsx` on purpose: that one is a sticky footer inside a
 * settings card reporting "unsaved changes", and this is a fixed bar reporting how much of a draft
 * still needs a decision. Same shape, different question. They share `useUnloadGuard`, which is
 * the part that genuinely is the same.
 */
export function DraftSaveBar({
  visible,
  openAsks,
  blockedBy,
  manual = false,
  filled = 0,
  total = 0,
  saving,
  onSave,
  onDiscard,
  onJumpToAsk,
}: DraftSaveBarProps) {
  // Everything on this sheet exists only in the page until it is saved.
  useUnloadGuard(visible)

  const settled = !blockedBy && (manual ? filled > 0 : openAsks === 0)

  return (
    <div
      // Stays mounted and slides out of view rather than unmounting, so showing it never reflows
      // the sheet. `inert` keeps its buttons out of the tab order while it is off screen.
      inert={!visible}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 px-4 pb-5 md:px-8',
        'transition-transform duration-[420ms] ease-contour motion-reduce:transition-none',
        visible ? 'translate-y-0' : 'translate-y-[140%]'
      )}
    >
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 rounded-panel border border-ink/[0.06] bg-surface/92 py-3 pl-5 pr-3 shadow-pop backdrop-blur-[16px]">
        <p className="flex min-w-0 flex-1 basis-full items-center gap-2 text-caption sm:basis-auto">
          {/* Living Green once settled, Amber while something waits. Never lime: at 8px on a light
              bar it measures 1.35:1. */}
          <span
            aria-hidden
            className={cn('size-2 flex-none rounded-full', settled ? 'bg-spring' : 'bg-pending')}
          />
          {blockedBy ? (
            <span>
              <b className="font-semibold">{blockedBy} still needed</b>{' '}
              <span className="text-text3">· everything else is ready to save</span>
            </span>
          ) : manual ? (
            <span>
              <b className="font-semibold">
                {filled} of {total} filled
              </b>{' '}
              <span className="text-text3">· save whenever you like, the rest stays editable</span>
            </span>
          ) : openAsks > 0 ? (
            <span>
              <b className="font-semibold">
                {openAsks} thing{openAsks === 1 ? '' : 's'} need{openAsks === 1 ? 's' : ''} your
                call
              </b>{' '}
              <span className="text-text3">· everything else is drafted</span>
            </span>
          ) : (
            <span>
              <b className="font-semibold">All checked</b>{' '}
              <span className="text-text3">· ready to save</span>
            </span>
          )}
        </p>

        {(openAsks > 0 || blockedBy) && (
          <button
            type="button"
            onClick={onJumpToAsk}
            className={cn(
              'flex-none rounded-sm px-2.5 py-1.5 text-caption font-medium text-pending',
              'transition-colors duration-150 ease-contour hover:bg-pending-bg',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring'
            )}
          >
            Take me there ↓
          </button>
        )}

        <Button variant="danger" size="sm" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button size="lg" onClick={onSave} loading={saving} disabled={!!blockedBy}>
          Save client →
        </Button>
      </div>
    </div>
  )
}
