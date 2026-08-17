/**
 * Which arrows step the collection — a row answers to Left/Right, a column to Up/Down, and a grid
 * of `columns` per row answers to all four, stepping one cell sideways and one ROW vertically.
 */
type RovingOrientation = 'vertical' | 'horizontal' | { grid: number }

const STEP_KEYS: Record<'vertical' | 'horizontal', { next: string; previous: string }> = {
  vertical: { next: 'ArrowDown', previous: 'ArrowUp' },
  horizontal: { next: 'ArrowRight', previous: 'ArrowLeft' },
}

/**
 * Move focus through a one-dimensional list of controls with the arrow keys, Home and End.
 *
 * Clamps rather than wraps — a list that jumps from bottom to top on one more ArrowDown reads as a
 * mis-press. Returns true when the event was handled, so a caller can decide what else to suppress.
 *
 * It stops propagation, not just the default. That matters wherever a list opens inside a surface
 * with window-level shortcuts: the canvas editor binds ArrowUp/Down on `window` to nudge the
 * selected node by 1px, and Radix portals a popover outside the editor's own DOM subtree, so
 * without this an arrow keypress in a font list both moves the focus AND slides the artwork.
 */
export function rovingFocus(
  event: React.KeyboardEvent,
  items: HTMLElement[],
  orientation: RovingOrientation = 'vertical'
): boolean {
  const columns = typeof orientation === 'object' ? orientation.grid : null
  const step = typeof orientation === 'object' ? STEP_KEYS.horizontal : STEP_KEYS[orientation]
  // A grid claims both pairs; a one-dimensional list claims only its own. The other pair belongs to
  // whatever is underneath — in the editor that is a 1px nudge of the selected node, which a list
  // has no business eating. A grid DOES have business with it: its second axis is real movement,
  // and leaving Up/Down unclaimed there would silently slide the artwork while focus is in a panel.
  const rowKeys = columns === null ? [] : [STEP_KEYS.vertical.next, STEP_KEYS.vertical.previous]
  if (![step.next, step.previous, ...rowKeys, 'Home', 'End'].includes(event.key)) return false
  event.preventDefault()
  event.stopPropagation()
  if (items.length === 0) return true

  const current = items.indexOf(document.activeElement as HTMLElement)
  const delta =
    event.key === step.next
      ? 1
      : event.key === step.previous
        ? -1
        : event.key === STEP_KEYS.vertical.next
          ? (columns ?? 0)
          : -(columns ?? 0)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : Math.max(0, Math.min(current + delta, items.length - 1))
  items[next]?.focus()
  return true
}

/** The focusable rows of a container, in DOM order — the usual argument to `rovingFocus`. */
export function focusableItems(container: HTMLElement | null, selector: string): HTMLElement[] {
  return Array.from(container?.querySelectorAll<HTMLElement>(selector) ?? [])
}
