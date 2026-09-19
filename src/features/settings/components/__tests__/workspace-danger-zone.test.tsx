import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The rail's two states: refused — the sentence and the plan's own Cancel plan, no delete
 * button — and deletable — the sentence and a button that opens the confirm dialog. The cancel
 * control itself is `PlanEndControl`'s test.
 */
vi.mock('@/features/settings/actions/workspace-actions', () => ({ deleteWorkspace: vi.fn() }))
vi.mock('@/features/settings/components/plan-end-control', () => ({
  PlanEndControl: ({ ending }: { ending: boolean }) => (
    <button type="button">{ending ? 'Keep plan' : 'Cancel plan'}</button>
  ),
}))

import { WorkspaceDangerZone } from '../workspace-danger-zone'

function setup(props: Partial<Parameters<typeof WorkspaceDangerZone>[0]> = {}) {
  render(
    <WorkspaceDangerZone
      agencyName="About Social Media"
      clientCount={3}
      memberCount={2}
      agencyMode="agency"
      refusal={null}
      cancelConsequence="Your plan ends on 1 October and nothing more is charged."
      notice={null}
      {...props}
    />
  )
  return userEvent.setup()
}

describe('WorkspaceDangerZone', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses with the sentence and offers the plan’s end, never the delete', () => {
    setup({ refusal: 'Cancel your plan first.' })
    expect(screen.getByText('Cancel your plan first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete workspace' })).not.toBeInTheDocument()
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
