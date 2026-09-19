import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DoneView } from '../components/done/done-view'

/**
 * The run's close offers four next actions; this pins where the two that navigate go, and
 * that the approval email stays shut when nothing was kept.
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/approval/request-approval', () => ({
  requestApprovalEmail: vi.fn(),
}))

function renderDone(approvedCount: number) {
  const onNewRun = vi.fn()
  render(
    <DoneView
      approvedCount={approvedCount}
      discardedCount={1}
      skippedPillarCount={0}
      restingPillarCount={0}
      clientName="Acme"
      clientId="client-1"
      onNewRun={onNewRun}
    />
  )
  return { onNewRun }
}

describe('DoneView', () => {
  it('opens the calendar or the dashboard, and hands a new run back to the flow', async () => {
    const user = userEvent.setup()
    const { onNewRun } = renderDone(2)

    await user.click(screen.getByRole('button', { name: /Open the calendar/ }))
    expect(push).toHaveBeenCalledWith('/calendar')

    await user.click(screen.getByRole('button', { name: /Back to dashboard/ }))
    expect(push).toHaveBeenCalledWith('/dashboard')

    await user.click(screen.getByRole('button', { name: /Generate another run/ }))
    expect(onNewRun).toHaveBeenCalledTimes(1)
  })

  it('keeps the approval email shut when nothing was kept', () => {
    renderDone(0)

    expect(screen.getByRole('heading', { name: 'Nothing kept this time' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send for client approval/ })).toBeDisabled()
  })
})
