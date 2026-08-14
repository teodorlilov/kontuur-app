'use client'

import { useCallback, useRef } from 'react'

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
 * Focus is moved by walking the DOM rather than by holding an index in state: the lanes
 * re-render on every mutation, and an index would point at whatever card happened to
 * take that position afterwards.
 */
export function useGridNavigation(columnCount: number) {
  const gridRef = useRef<HTMLDivElement>(null)

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

  return { gridRef, onKeyDown }
}
