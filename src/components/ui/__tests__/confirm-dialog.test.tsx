import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../confirm-dialog'

/**
 * The system's yes/no decision, tested through the keyboard and the accessible tree.
 *
 * This is the shape of defect jsdom is actually for (TECH-DEBT §7.12): not "does it look
 * right" — it cannot know — but "can the thing be operated". Two of the eight editor-arc
 * defects were exactly this: a panel unreachable by keyboard, and ⌘Z passing through an
 * open dialog to the canvas underneath.
 *
 * Queried by role rather than by class, so a restyle does not break the test and a
 * change that removes the accessible name does.
 */
function setup(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <ConfirmDialog
      open
      title="Discard this draft?"
      confirmLabel="Discard and leave"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    >
      Three slides and their edits will be lost.
    </ConfirmDialog>
  )
  return { onConfirm, onClose, user: userEvent.setup() }
}

describe('ConfirmDialog', () => {
  it('names the decision and its consequence', () => {
    setup()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Discard this draft?')).toBeInTheDocument()
    expect(screen.getByText(/three slides and their edits will be lost/i)).toBeInTheDocument()
  })

  it('labels the acting button with what it does, never "OK"', () => {
    setup()
    // DESIGN.md's rule, and the reason ConfirmDialog exists instead of window.confirm.
    expect(screen.getByRole('button', { name: 'Discard and leave' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ok$/i })).not.toBeInTheDocument()
  })

  it('confirms and cancels through their own handlers', async () => {
    const { onConfirm, onClose, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const { onClose, user } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reaches both actions by keyboard alone', async () => {
    const { onConfirm, user } = setup()
    // A dialog operable only by pointer is the layers-panel defect again: the control
    // renders, looks correct in review, and cannot be reached without a mouse.
    await user.tab()
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cannot be double-submitted while the action is in flight', async () => {
    const { onConfirm, user } = setup({ loading: true })
    // `loading` disables through Button's `disabled={disabled || loading}`. If that
    // coupling is ever broken, an impatient second click sends the mutation twice.
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("will not act while the body's own gate is unsatisfied", async () => {
    const { onConfirm, user } = setup({ disabled: true })
    // `disabled` is what holds a type-to-confirm dialog shut until the name matches. It rides
    // the same `disabled={disabled || loading}` coupling as the loading case above — break
    // either and a client is deleted by someone who never finished typing its name.
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
