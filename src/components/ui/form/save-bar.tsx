'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

interface SaveBarProps {
  dirty: boolean
  /** Names what changed, e.g. the tab. Shown after "Unsaved changes ·". */
  label: string
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}

/**
 * Sticky footer that appears once something has actually changed.
 *
 * Stays mounted and slides out of view rather than unmounting, so showing and hiding it does not
 * reflow the form beneath.
 */
export function SaveBar({ dirty, label, saving, onSave, onDiscard }: SaveBarProps) {
  useUnloadGuard(dirty)

  return (
    <div
      // `inert` while retracted: the bar stays mounted so showing it does not reflow the form,
      // but its buttons must leave the tab order and the a11y tree while off screen.
      inert={!dirty}
      className={cn(
        'sticky bottom-0 z-20 -mx-6 -mb-[22px] flex items-center gap-3.5 rounded-b-[19px]',
        'border-t border-line2 bg-surface/92 px-6 py-3.5 backdrop-blur-[14px]',
        'transition-[transform,opacity] duration-300 ease-contour motion-reduce:transition-none',
        dirty ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      )}
    >
      <div className="flex flex-1 items-center gap-[9px] text-[13px]">
        <span aria-hidden className="size-2 rounded-xs bg-accent" />
        <span>
          <b className="font-semibold">Unsaved changes</b>{' '}
          <span className="text-text3">· {label}</span>
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button size="sm" onClick={onSave} loading={saving}>
        Save changes
      </Button>
    </div>
  )
}

/**
 * Warns before leaving with unsaved work.
 *
 * Attached only while dirty and removed as soon as it is not: a `beforeunload` listener that is
 * always registered disables the back/forward cache for the whole route.
 */
function useUnloadGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return

    function handler(event: BeforeUnloadEvent) {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}
