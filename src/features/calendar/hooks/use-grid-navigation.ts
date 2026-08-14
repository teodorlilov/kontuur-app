'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Arrow-key movement across a calendar grid, with a roving tabindex.
 *
 * The month grid today has no keyboard handling at all: its cells are bare
 * `<div onClick>` with no `role`, no `tabIndex` and no key handling, so a keyboard user
 * reaches posts only by tabbing through every card in DOM order and never learns which
 * day they are in.
 *
 * Written rather than reused: `Listbox`'s `handleKeyDown` is the repo's only roving
 * implementation, and it is one-dimensional over `[role="option"]` inside a Radix
 * popover. A week is two-dimensional — Left/Right move between days, Up/Down between
 * cards within a day — so the two cannot share.
 *
 * Focus is *moved* by walking the DOM rather than by holding an index in state: the lanes
 * re-render on every mutation, and an index would point at whatever card happened to
 * take that position afterwards.
 *
 * The roving tabindex is the separate half, and for a long time it was only a claim in
 * this comment. Every lane item rendered as an ordinary `<button>`, so all of them were
 * tab stops and Tab walked the week card by card — which is exactly what `role="grid"`
 * exists to avoid, and what a keyboard user has to sit through twelve times on a busy
 * week. `activeColumn`/`activeRow` below are the authority for which single cell answers
 * to Tab; arrows do the rest.
 */
export function useGridNavigation(columnCount: number) {
  const gridRef = useRef<HTMLDivElement>(null)
  /**
   * The one cell in the grid that is reachable with Tab.
   *
   * Only a *tabindex* pointer, never a focus pointer — the DOM keeps the latter. It is
   * updated from real focus events, so clicking a card and then tabbing away and back
   * returns to that card rather than to Monday.
   */
  const [active, setActive] = useState<{ column: number; row: number }>({ column: 0, row: 0 })

  const focusCell = useCallback((column: number, row: number) => {
    const grid = gridRef.current
    if (!grid) return
    const columnEl = grid.querySelector<HTMLElement>(`[data-grid-column="${column}"]`)
    if (!columnEl) return

    const cells = [...columnEl.querySelectorAll<HTMLElement>('[data-grid-cell]')]
    if (cells.length === 0) {
      // An empty day still deserves focus, or Left/Right stops dead at a quiet day
      // rather than passing through it.
      columnEl.focus()
      return
    }
    cells[Math.min(Math.max(row, 0), cells.length - 1)]?.focus()
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      const cell = target.closest<HTMLElement>('[data-grid-cell]')
      const columnEl = target.closest<HTMLElement>('[data-grid-column]')
      if (!columnEl) return

      const column = Number(columnEl.dataset.gridColumn)
      const cells = [...columnEl.querySelectorAll<HTMLElement>('[data-grid-cell]')]
      const row = cell ? cells.indexOf(cell) : -1

      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          focusCell(Math.min(column + 1, columnCount - 1), row)
          break
        case 'ArrowLeft':
          event.preventDefault()
          focusCell(Math.max(column - 1, 0), row)
          break
        case 'ArrowDown':
          event.preventDefault()
          focusCell(column, row + 1)
          break
        case 'ArrowUp':
          event.preventDefault()
          focusCell(column, row - 1)
          break
        case 'Home':
          event.preventDefault()
          focusCell(0, 0)
          break
        case 'End':
          event.preventDefault()
          focusCell(columnCount - 1, 0)
          break
        default:
          // Clamped, not wrapped: wrapping from Sunday to Monday would move the user
          // backwards through the week without saying so.
          break
      }
    },
    [columnCount, focusCell]
  )

  /**
   * Follow real focus, wherever it came from.
   *
   * React's `onFocus` is `focusin`, so this catches the pointer as well as the keyboard —
   * without it, clicking Thursday and tabbing out would return to whatever cell the
   * arrows last visited.
   */
  const onFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const columnEl = target.closest<HTMLElement>('[data-grid-column]')
    if (!columnEl) return

    const column = Number(columnEl.dataset.gridColumn)
    const cell = target.closest<HTMLElement>('[data-grid-cell]')
    const cells = [...columnEl.querySelectorAll<HTMLElement>('[data-grid-cell]')]
    const row = cell ? Math.max(cells.indexOf(cell), 0) : 0

    setActive((prev) => (prev.column === column && prev.row === row ? prev : { column, row }))
  }, [])

  return { gridRef, onKeyDown, onFocus, activeColumn: active.column, activeRow: active.row }
}
