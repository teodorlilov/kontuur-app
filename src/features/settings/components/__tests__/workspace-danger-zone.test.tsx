import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The rail's two states: refused — the sentence and no button at all, the plan panel's own
 * Cancel plan being the way through — and deletable — the sentence and a button that opens the
 * confirm dialog.
 */
vi.mock('@/features/settings/actions/workspace-actions', () => ({ deleteWorkspace: vi.fn() }))

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
  beforeEach(() => vi.clearAllMocks())

  it('refuses with the sentence and no button — cancelling lives in the plan panel', () => {
    setup({ refusal: 'Cancel your plan first.' })
    expect(screen.getByText('Cancel your plan first.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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
