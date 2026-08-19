import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MastheadControls } from '../components/masthead-controls'
import { AnalyticsNavProvider } from '../components/analytics-nav'
import type { AnalyticsPeriod } from '../lib/period'

/**
 * The operator chrome of the comparison console. What matters: the range
 * buttons navigate by URL (the page is server-rendered), Custom validates its
 * bounds before navigating, and Export archives BEFORE printing so the
 * archive row matches what the printed report said.
 */
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}))

const toastError = vi.fn()
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: (m: string) => toastError(m) },
}))

const archiveReport = vi.fn()
// Wrapped rather than passed by reference: vi.mock is hoisted above the const.
vi.mock('../actions/report-actions', () => ({
  archiveReport: (input: unknown) => archiveReport(input),
}))

const PERIOD: AnalyticsPeriod = {
  preset: '30d',
  start: '2026-07-20',
  end: '2026-08-18',
  prevStart: '2026-06-20',
  prevEnd: '2026-07-19',
  days: 30,
}

const CLIENTS = [
  { id: 'c1', name: 'GreenLeaf Café' },
  { id: 'c2', name: 'Haelan' },
]

function renderControls(over: Partial<Parameters<typeof MastheadControls>[0]> = {}) {
  return render(
    <AnalyticsNavProvider>
      <MastheadControls clientId="c1" clients={CLIENTS} period={PERIOD} hasHistory {...over} />
    </AnalyticsNavProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.print = vi.fn()
})

describe('MastheadControls', () => {
  it('marks the active range and navigates on another preset', async () => {
    const user = userEvent.setup()
    renderControls()

    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '7 days' }))
    expect(push).toHaveBeenCalledWith('/analytics?client=c1&range=7d')
  })

  it('applies a valid custom window as from/to params', async () => {
    const user = userEvent.setup()
    renderControls()

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    await user.clear(from)
    await user.type(from, '2026-08-01')
    await user.clear(to)
    await user.type(to, '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(push).toHaveBeenCalledWith('/analytics?client=c1&from=2026-08-01&to=2026-08-10')
  })

  it('refuses an inverted custom window instead of navigating', async () => {
    const user = userEvent.setup()
    renderControls()

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const from = screen.getByLabelText('From')
    // Clear "To" so from > to — fireEvent path because max= blocks typing beyond it.
    const to = screen.getByLabelText('To')
    await user.clear(to)
    await user.clear(from)
    await user.type(from, '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(push).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })

  it('archives the shown period, refreshes, then prints', async () => {
    archiveReport.mockResolvedValue({ ok: true, data: undefined })
    const user = userEvent.setup()
    renderControls()

    await user.click(screen.getByRole('button', { name: 'Export report' }))

    await waitFor(() => expect(window.print).toHaveBeenCalled())
    expect(archiveReport).toHaveBeenCalledWith({
      clientId: 'c1',
      preset: '30d',
      start: '2026-07-20',
      end: '2026-08-18',
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('does not print when archiving fails — the error surfaces instead', async () => {
    archiveReport.mockResolvedValue({ ok: false, error: 'Nothing to export yet' })
    const user = userEvent.setup()
    renderControls()

    await user.click(screen.getByRole('button', { name: 'Export report' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Nothing to export yet'))
    expect(window.print).not.toHaveBeenCalled()
  })

  it('disables Export before the first sync', () => {
    renderControls({ hasHistory: false })
    expect(screen.getByRole('button', { name: 'Export report' })).toBeDisabled()
  })
})
