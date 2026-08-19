import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegenerateNarrative } from '../components/regenerate-narrative'
import type { AnalyticsPeriod } from '../lib/period'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}))

const toastError = vi.fn()
const toastWarning = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    warning: (m: string) => toastWarning(m),
    error: (m: string) => toastError(m),
  },
}))

const regenerateReport = vi.fn()
// Wrapped rather than passed by reference: vi.mock is hoisted above the const.
vi.mock('../actions/report-actions', () => ({
  regenerateReport: (input: unknown) => regenerateReport(input),
}))

const PERIOD: AnalyticsPeriod = {
  preset: '7d',
  start: '2026-08-12',
  end: '2026-08-18',
  prevStart: '2026-08-05',
  prevEnd: '2026-08-11',
  days: 7,
}

beforeEach(() => vi.clearAllMocks())

describe('RegenerateNarrative', () => {
  it('pulls the shown period, confirms the refresh, and re-renders the page', async () => {
    regenerateReport.mockResolvedValue({
      ok: true,
      data: { refreshed: true, rateLimited: false, note: null },
    })
    const user = userEvent.setup()
    render(<RegenerateNarrative clientId="c1" period={PERIOD} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(regenerateReport).toHaveBeenCalledWith({
      clientId: 'c1',
      preset: '7d',
      start: '2026-08-12',
      end: '2026-08-18',
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('warns when the refresh degraded to stored data, but still re-renders', async () => {
    regenerateReport.mockResolvedValue({
      ok: true,
      data: { refreshed: false, rateLimited: false, note: 'Instagram is not connected' },
    })
    const user = userEvent.setup()
    render(<RegenerateNarrative clientId="c1" period={PERIOD} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(toastWarning).toHaveBeenCalledWith('Instagram is not connected'))
    expect(refresh).toHaveBeenCalled()
  })

  it('names a rate-limited partial refresh', async () => {
    regenerateReport.mockResolvedValue({
      ok: true,
      data: { refreshed: true, rateLimited: true, note: null },
    })
    const user = userEvent.setup()
    render(<RegenerateNarrative clientId="c1" period={PERIOD} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(toastWarning).toHaveBeenCalled())
    expect(refresh).toHaveBeenCalled()
  })

  it('surfaces a failed regeneration and does not refresh', async () => {
    regenerateReport.mockResolvedValue({ ok: false, error: 'Nothing to write yet' })
    const user = userEvent.setup()
    render(<RegenerateNarrative clientId="c1" period={PERIOD} />)

    await user.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Nothing to write yet'))
    expect(refresh).not.toHaveBeenCalled()
  })
})
