import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsNavProvider, PendingVeil, useAnalyticsNav } from '../components/analytics-nav'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}))

function Trigger() {
  const { navigate } = useAnalyticsNav()
  return (
    <button type="button" onClick={() => navigate('/analytics?range=7d')}>
      Go
    </button>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('AnalyticsNavProvider', () => {
  it('routes navigation through the shared transition', async () => {
    const user = userEvent.setup()
    render(
      <AnalyticsNavProvider>
        <Trigger />
        <PendingVeil>
          <p>document</p>
        </PendingVeil>
      </AnalyticsNavProvider>
    )

    await user.click(screen.getByRole('button', { name: 'Go' }))
    expect(push).toHaveBeenCalledWith('/analytics?range=7d')
  })

  it('presents the document unveiled when nothing is in flight', () => {
    render(
      <AnalyticsNavProvider>
        <PendingVeil>
          <p>document</p>
        </PendingVeil>
      </AnalyticsNavProvider>
    )
    expect(screen.getByText('document')).toBeVisible()
    expect(screen.queryByText('Loading period…')).not.toBeInTheDocument()
  })
})
