import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The dialog's own: its copy, that the typed value reaches the action, that a refusal stays on
 * the page, and that success leaves for the goodbye page and nowhere else. The typed-name gate
 * is `TypedConfirmDialog`'s test; here it is only crossed.
 */
const mocks = vi.hoisted(() => ({
  deleteWorkspace: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  assign: vi.fn(),
}))
vi.mock('@/features/settings/actions/workspace-actions', () => ({
  deleteWorkspace: (typed: string) => mocks.deleteWorkspace(typed),
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))

import { DeleteWorkspaceDialog } from '../delete-workspace-dialog'

function setup(props: Partial<Parameters<typeof DeleteWorkspaceDialog>[0]> = {}) {
  render(
    <DeleteWorkspaceDialog
      open
      onClose={vi.fn()}
      agencyName="About Social Media"
      clientCount={3}
      memberCount={2}
      agencyMode="agency"
      notice={null}
      {...props}
    />
  )
  return userEvent.setup()
}

const confirm = () => screen.getByRole('button', { name: 'Delete permanently' })

describe('DeleteWorkspaceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    Object.defineProperty(window, 'location', { value: { assign: mocks.assign }, writable: true })
    mocks.deleteWorkspace.mockResolvedValue({ ok: true })
  })

  it('names what goes, what the law keeps, and the plan line when there is one', () => {
    setup({ notice: 'Your plan ends on 1 October; nothing more will be charged.' })
    expect(screen.getByText('3 clients')).toBeInTheDocument()
    expect(screen.getByText('2 members and their accounts')).toBeInTheDocument()
    expect(screen.getByText(/kept for ten years/)).toBeInTheDocument()
    expect(screen.getByText(/Your plan ends on 1 October/)).toBeInTheDocument()
  })

  it('speaks to a solo workspace as one business and one account', () => {
    setup({ agencyMode: 'solo', clientCount: 1, memberCount: 1 })
    expect(screen.getByText('your business')).toBeInTheDocument()
    expect(screen.getByText('your account')).toBeInTheDocument()
    expect(screen.queryByText(/client/)).not.toBeInTheDocument()
  })

  it('hands what was typed to the action and leaves for the goodbye page', async () => {
    const user = setup()
    await user.type(screen.getByRole('textbox'), 'about social media')
    await user.click(confirm())
    await waitFor(() => expect(mocks.deleteWorkspace).toHaveBeenCalledWith('about social media'))
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith('/goodbye'))
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it('shows a refusal and stays put, with the button usable again', async () => {
    mocks.deleteWorkspace.mockResolvedValue({ ok: false, error: 'Cancel your plan first' })
    const user = setup()
    await user.type(screen.getByRole('textbox'), 'About Social Media')
    await user.click(confirm())
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Cancel your plan first'))
    expect(mocks.assign).not.toHaveBeenCalled()
    await waitFor(() => expect(confirm()).not.toBeDisabled())
  })

  it('recovers when the action throws rather than returning', async () => {
    mocks.deleteWorkspace.mockRejectedValue(new Error('network'))
    const user = setup()
    await user.type(screen.getByRole('textbox'), 'About Social Media')
    await user.click(confirm())
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
    expect(mocks.assign).not.toHaveBeenCalled()
    await waitFor(() => expect(confirm()).not.toBeDisabled())
  })
})
