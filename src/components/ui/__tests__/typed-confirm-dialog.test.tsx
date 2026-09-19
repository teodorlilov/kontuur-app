import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TypedConfirmDialog } from '../typed-confirm-dialog'

/**
 * The typed-name gate is the whole safety mechanism of the two deletions that use it — if it
 * stops being wired to the confirm button, nothing visible changes and either dialog quietly
 * becomes a one-click delete. Pinned once, here; the dialogs' own tests pin their copy, their
 * action and their exit.
 */
function setup(props: Partial<Parameters<typeof TypedConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <TypedConfirmDialog
      open
      title="Delete this thing"
      confirmLabel="Delete permanently"
      name="Acme Dental"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    >
      <p>Everything goes.</p>
    </TypedConfirmDialog>
  )
  return { onConfirm, onClose, user: userEvent.setup() }
}

const confirm = () => screen.getByRole('button', { name: 'Delete permanently' })

describe('TypedConfirmDialog', () => {
  it('will not confirm until the name is typed — a prefix is not the name', async () => {
    const { user, onConfirm } = setup()
    expect(confirm()).toBeDisabled()
    await user.type(screen.getByRole('textbox'), 'Acme')
    expect(confirm()).toBeDisabled()
    await user.click(confirm())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('accepts the name regardless of case or spacing, and hands the typed value up', async () => {
    const { user, onConfirm } = setup()
    await user.type(screen.getByRole('textbox'), '  acme   dental ')
    await user.click(confirm())
    expect(onConfirm).toHaveBeenCalledWith('  acme   dental ')
  })

  it('keeps what was typed until the dialog is closed', async () => {
    const { user, onClose } = setup()
    await user.type(screen.getByRole('textbox'), 'Acme Dental')
    expect(screen.getByRole('textbox')).toHaveValue('Acme Dental')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('locks the field and the button while the action runs', () => {
    setup({ loading: true })
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(confirm()).toBeDisabled()
  })
})
