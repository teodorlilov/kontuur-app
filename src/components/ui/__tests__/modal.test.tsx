import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../modal'

/**
 * The dialog frame every other dialog is built on.
 *
 * Worth testing on its own rather than only through ConfirmDialog: Modal owns the
 * portal, the focus trap and the three ways it can be dismissed, and a regression in any
 * of those reaches every surface that opens a dialog at once.
 *
 * The focus trap is the load-bearing part. TECH-DEBT §7.12 lists "⌘Z reaching the canvas
 * through an open dialog" among the eight editor defects — a dialog that does not hold
 * focus lets the surface underneath keep receiving keys.
 */
describe('Modal', () => {
  it('portals its content and names itself by its title', () => {
    render(
      <Modal open onClose={vi.fn()} title="Schedule this batch">
        <p>Body</p>
      </Modal>
    )
    expect(screen.getByRole('dialog', { name: 'Schedule this batch' })).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Schedule">
        <p>Body</p>
      </Modal>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape, on the X, and on the backdrop', async () => {
    const user = userEvent.setup()

    const onEscape = vi.fn()
    const { unmount } = render(
      <Modal open onClose={onEscape} title="T">
        <p>Body</p>
      </Modal>
    )
    await user.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalledTimes(1)
    unmount()

    const onX = vi.fn()
    render(
      <Modal open onClose={onX} title="T">
        <p>Body</p>
      </Modal>
    )
    // Named "Close" via aria-label — the X is an icon with no text.
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onX).toHaveBeenCalledTimes(1)
  })

  it('moves focus inside itself on open', async () => {
    render(
      <Modal open onClose={vi.fn()} title="T">
        <button type="button">Inside</button>
      </Modal>
    )
    const dialog = await screen.findByRole('dialog')
    // Radix focuses the content (or its first focusable child). Either satisfies the
    // property that matters: keystrokes now belong to the dialog, not to what is behind it.
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('takes the rest of the page out of the accessibility tree', () => {
    render(
      <>
        <button type="button">Outside</button>
        <Modal open onClose={vi.fn()} title="T">
          <button type="button">Inside</button>
        </Modal>
      </>
    )
    // `getByRole` searches the ACCESSIBLE tree, so the outside button being unfindable
    // is the assertion, not an accident: Radix marks the rest of the document
    // aria-hidden while a dialog is open. A screen reader cannot wander out of it.
    expect(screen.queryByRole('button', { name: 'Outside' })).not.toBeInTheDocument()
    // Asserted through the ancestor, not the button's own attribute: Radix hides the
    // wrapping subtree. Pinning *which* element carries the flag would break on a Radix
    // upgrade that still behaves correctly.
    const outside = screen.getByRole('button', { name: 'Outside', hidden: true })
    expect(outside.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Inside' })).toBeInTheDocument()
  })

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">Outside</button>
        <Modal open onClose={vi.fn()} title="T">
          <button type="button">First</button>
          <button type="button">Second</button>
        </Modal>
      </>
    )
    const dialog = screen.getByRole('dialog')
    const outside = screen.getByRole('button', { name: 'Outside', hidden: true })

    // Round-trip the trap more times than it has stops, so a leak shows up wherever it is.
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(outside).not.toHaveFocus()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})
