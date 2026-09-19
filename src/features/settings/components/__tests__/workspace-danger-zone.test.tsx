import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The rail's two states: refused — the sentence and a portal hand-off, no delete button — and
 * deletable — the sentence and a button that opens the confirm dialog.
 */
const mocks = vi.hoisted(() => ({
  openBillingPortal: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  assign: vi.fn(),
}))
vi.mock('@/features/settings/actions/billing-actions', () => ({
  openBillingPortal: mocks.openBillingPortal,
}))
vi.mock('@/features/settings/actions/workspace-actions', () => ({ deleteWorkspace: vi.fn() }))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))

import { WorkspaceDangerZone } from '../workspace-danger-zone'

function setup(props: Partial<Parameters<typeof WorkspaceDangerZone>[0]> = {}) {
  render(
    <WorkspaceDangerZone
      agencyName="About Social Media"
      clientCount={3}
      memberCount={2}
      agencyMode="agency"
      refusal={null}
      notice={null}
      {...props}
    />
  )
  return userEvent.setup()
}

describe('WorkspaceDangerZone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', { value: { assign: mocks.assign }, writable: true })
  })

  it('refuses with the sentence and hands off to the portal, offering no delete', async () => {
    mocks.openBillingPortal.mockResolvedValue({
      ok: true,
      data: { url: 'https://billing.stripe.com/p/1' },
    })
    const user = setup({ refusal: 'Cancel your plan first — Manage billing → Cancel plan.' })
    expect(screen.getByText(/Cancel your plan first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete workspace' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Manage billing' }))
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith('https://billing.stripe.com/p/1'))
  })

  it('opens the confirm dialog from the delete button', async () => {
    const user = setup()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete workspace' }))
    expect(screen.getByRole('dialog', { name: 'Delete this workspace' })).toBeInTheDocument()
  })

  it('words a solo workspace as a business and its own account', () => {
    setup({ agencyMode: 'solo' })
    expect(screen.getByText(/removes your business/)).toBeInTheDocument()
  })
})
