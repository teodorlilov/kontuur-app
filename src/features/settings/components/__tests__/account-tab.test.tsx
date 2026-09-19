import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The timezone hint carries the clock of the zone it names, so a wrong zone shows itself. Pinned
 * at a fixed instant: the same minute reads differently in Sofia and in London, and moves when
 * the minute turns. Both server actions the tab reaches through the danger zone are stubbed —
 * they are `server-only` and never run here.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/settings/actions/workspace-actions', () => ({ deleteWorkspace: vi.fn() }))
vi.mock('@/features/settings/actions/billing-actions', () => ({ setPlanEndingAction: vi.fn() }))

import { AccountTab } from '../account-tab'

function renderTab(timezone: string) {
  render(<AccountTab agency={{ name: 'Acme', timezone }} currentUserRole="admin" />)
}

describe('AccountTab timezone hint', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-19T09:30:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the time it is in the selected zone, and follows a change of zone', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderTab('Europe/Sofia')

    expect(screen.getByText(/It's 12:30 there right now\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Timezone' }))
    await user.click(await screen.findByRole('option', { name: /London/ }))
    expect(screen.getByText(/It's 10:30 there right now\./)).toBeInTheDocument()
  })

  it('moves with the clock', () => {
    renderTab('UTC')
    expect(screen.getByText(/It's 09:30 there right now\./)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText(/It's 09:31 there right now\./)).toBeInTheDocument()
  })
})
