'use client'

import { useCallback, useMemo, useState } from 'react'

export interface EditorSelection {
  ids: string[]
  /** The node whose controls the panel shows — the last one added to the selection. */
  primaryId: string | null
  isMultiple: boolean
  has: (id: string) => boolean
  selectOnly: (id: string | null) => void
  /** Shift-click: add if absent, remove if already selected. */
  toggle: (id: string) => void
  selectMany: (ids: string[]) => void
  clear: () => void
}

/**
 * Which nodes are selected. Selection is view state — it never touches the doc or its history.
 *
 * Ids are filtered against the nodes that currently exist rather than synchronised with them: undo,
 * redo and every delete change the doc without going through this hook, and a selection holding a
 * node that is no longer there reads as "something is selected" to the Escape ladder and the
 * properties panel while showing nothing on the canvas.
 */
export function useEditorSelection(existingIds: Set<string>): EditorSelection {
  const [raw, setRaw] = useState<string[]>([])

  const ids = useMemo(
    () => raw.filter((id) => existingIds.has(id)),
    // A doc with the same ids should not produce a new array — the identity feeds drag handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, [...existingIds].join(',')]
  )

  const selectOnly = useCallback((id: string | null) => setRaw(id ? [id] : []), [])

  const toggle = useCallback(
    (id: string) =>
      setRaw((current) =>
        current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
      ),
    []
  )

  const idSet = useMemo(() => new Set(ids), [ids])

  return {
    ids,
    primaryId: ids.length > 0 ? ids[ids.length - 1]! : null,
    isMultiple: ids.length > 1,
    has: useCallback((id: string) => idSet.has(id), [idSet]),
    selectOnly,
    toggle,
    selectMany: useCallback((next: string[]) => setRaw(next), []),
    clear: useCallback(() => setRaw([]), []),
  }
}
