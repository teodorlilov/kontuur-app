'use client'

import { useEffect } from 'react'

interface ReviewKeyboardHandlers {
  /** The caller decides when keys are live (focus layout, a draft in view, no pending decision). */
  enabled: boolean
  onPrev: () => void
  onNext: () => void
  onApprove: () => void
  onDiscard: () => void
}

/**
 * The review surface's hands-on-keys model: arrows move, A opens the approve
 * decision, D discards. Never while typing, never while a dialog is open.
 */
export function useReviewKeyboard({
  enabled,
  onPrev,
  onNext,
  onApprove,
  onDiscard,
}: ReviewKeyboardHandlers) {
  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowRight') onNext()
      else if (e.key === 'ArrowLeft') onPrev()
      else if (e.key === 'a' || e.key === 'A') onApprove()
      else if (e.key === 'd' || e.key === 'D') onDiscard()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onPrev, onNext, onApprove, onDiscard])
}
