'use client'

import { useCallback, useEffect, useRef } from 'react'

const AUTOSAVE_DELAY_MS = 800

interface QueueEdits {
  caption: string
  slidesJson: unknown
}

/**
 * Debounced persistence for the focused post's working copy. One pending slot:
 * scheduling edits for a different post flushes the previous one first, so a
 * fast draft-switch can never cross-save. Unmount flushes — leaving the tab
 * must not drop typed edits (the safe failure direction is an extra save).
 */
export function useQueueAutosave(persist: (postId: string, edits: QueueEdits) => Promise<void>) {
  const pendingRef = useRef<{ postId: string; edits: QueueEdits } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistRef = useRef(persist)
  useEffect(() => {
    persistRef.current = persist
  })

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = null
  }, [])

  const flush = useCallback(async () => {
    const pending = pendingRef.current
    cancel()
    if (pending) await persistRef.current(pending.postId, pending.edits)
  }, [cancel])

  const schedule = useCallback(
    (postId: string, edits: QueueEdits) => {
      if (pendingRef.current && pendingRef.current.postId !== postId) void flush()
      pendingRef.current = { postId, edits }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void flush()
      }, AUTOSAVE_DELAY_MS)
    },
    [flush]
  )

  useEffect(() => () => void flush(), [flush])

  return { schedule, flush, cancel }
}
