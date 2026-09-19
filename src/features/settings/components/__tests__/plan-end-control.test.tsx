import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Cancelling never leaves the app and never happens on one click: the consequence is read and
 * confirmed first. Keeping is one click. Both refresh, since the action already wrote the row.
 */
const mocks = vi.hoisted(() => ({
  setPlanEndingAction: vi.fn(),
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/features/settings/actions/billing-actions', () => ({
  setPlanEndingAction: (ending: boolean) => mocks.setPlanEndingAction(ending),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))

import { PlanEndControl } from '../plan-end-control'

const CONSEQUENCE = 'Your plan ends on 1 October and nothing more is charged.'

describe('PlanEndControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPlanEndingAction.mockResolvedValue({ ok: true })
  })

  it('cancels only after the consequence is read and confirmed, then refreshes', async () => {
    const user = userEvent.setup()
    render(<PlanEndControl ending={false} consequence={CONSEQUENCE} />)
    await user.click(screen.getByRole('button', { name: 'Cancel plan' }))
    expect(mocks.setPlanEndingAction).not.toHaveBeenCalled()
    expect(screen.getByText(CONSEQUENCE)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(mocks.setPlanEndingAction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel plan' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel plan' })
    )
    await waitFor(() => expect(mocks.setPlanEndingAction).toHaveBeenCalledWith(true))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
    expect(mocks.toast.success).toHaveBeenCalledWith('Your plan is set to end.')
  })

  it('keeps an ending plan on one click', async () => {
    const user = userEvent.setup()
    render(<PlanEndControl ending consequence={CONSEQUENCE} />)
    await user.click(screen.getByRole('button', { name: 'Keep plan' }))
    await waitFor(() => expect(mocks.setPlanEndingAction).toHaveBeenCalledWith(false))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
  })

  it('shows a refusal as a toast and refreshes nothing', async () => {
    mocks.setPlanEndingAction.mockResolvedValue({
      ok: false,
      error: 'Your plan is not set to end.',
    })
    const user = userEvent.setup()
    render(<PlanEndControl ending consequence={CONSEQUENCE} />)
    await user.click(screen.getByRole('button', { name: 'Keep plan' }))
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith('Your plan is not set to end.')
    )
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
