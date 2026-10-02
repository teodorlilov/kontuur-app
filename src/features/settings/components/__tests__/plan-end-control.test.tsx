import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Cancelling never leaves the app and never happens on one click: the consequence is read and
 * confirmed first. Keeping is one click. Neither asks the router for a refresh: the action's own
 * response carries the page re-rendered from the row it wrote.
 */
const mocks = vi.hoisted(() => ({
  setPlanEndingAction: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/features/settings/actions/billing-actions', () => ({
  setPlanEndingAction: (ending: boolean) => mocks.setPlanEndingAction(ending),
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))

import { PlanEndControl } from '../plan-end-control'

const CONSEQUENCE = 'Your plan ends on 1 October.'

describe('PlanEndControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setPlanEndingAction.mockResolvedValue({ ok: true, data: { endedNow: false } })
  })

  it('cancels only after the consequence is read and confirmed', async () => {
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
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith('Your plan is set to end.')
    )
  })

  it('says the plan has ended when the action ended it at once', async () => {
    mocks.setPlanEndingAction.mockResolvedValue({ ok: true, data: { endedNow: true } })
    const user = userEvent.setup()
    render(<PlanEndControl ending={false} consequence={CONSEQUENCE} />)
    await user.click(screen.getByRole('button', { name: 'Cancel plan' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel plan' })
    )
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Your plan has ended.'))
  })

  it('keeps an ending plan on one click', async () => {
    const user = userEvent.setup()
    render(<PlanEndControl ending consequence={CONSEQUENCE} />)
    await user.click(screen.getByRole('button', { name: 'Keep plan' }))
    await waitFor(() => expect(mocks.setPlanEndingAction).toHaveBeenCalledWith(false))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Your plan continues.'))
  })

  it('shows a refusal as a toast and nothing else', async () => {
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
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })
})
