import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TeamMember } from '@/types/api'

/**
 * A removal that answers ok is done, so the dialog closes and the list refreshes whether or not
 * the member's login could be deleted; a surviving login is said in the removal's notice.
 */
const mocks = vi.hoisted(() => ({
  removeTeamMember: vi.fn(),
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/features/settings/actions/team-actions', () => ({
  removeTeamMember: (id: string) => mocks.removeTeamMember(id),
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { TeamTab } from '../team-tab'

const ME: TeamMember = { id: 'u-admin', email: 'admin@agency.com', role: 'admin', created_at: null }
const THEM: TeamMember = {
  id: 'u-member',
  email: 'member@agency.com',
  role: 'member',
  created_at: null,
}
const NOTICE =
  'They were removed from the workspace, but their login could not be deleted. Contact support to finish removing it.'

async function confirmRemoval() {
  const user = userEvent.setup()
  render(
    <TeamTab
      members={[ME, THEM]}
      currentUserId={ME.id}
      currentUserRole="admin"
      agencyMode="agency"
    />
  )
  await user.click(screen.getByRole('button', { name: 'Remove' }))
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove permanently' })
  )
}

describe('TeamTab removal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes the dialog and refreshes after a clean removal', async () => {
    mocks.removeTeamMember.mockResolvedValue({ ok: true, data: { notice: null } })
    await confirmRemoval()
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        'member@agency.com removed from the workspace'
      )
    )
    expect(mocks.refresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the dialog and shows the notice when the login survived', async () => {
    mocks.removeTeamMember.mockResolvedValue({ ok: true, data: { notice: NOTICE } })
    await confirmRemoval()
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(NOTICE))
    expect(mocks.toast.success).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the dialog open on a refusal', async () => {
    mocks.removeTeamMember.mockResolvedValue({ ok: false, error: 'Could not remove the member' })
    await confirmRemoval()
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith('Could not remove the member')
    )
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
