import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { AutoFill } from '../components/auto-fill'
import type { AnalyticsPeriod } from '../lib/period'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}))

const fillPeriodData = vi.fn()
// Wrapped rather than passed by reference: vi.mock is hoisted above the const.
vi.mock('../actions/report-actions', () => ({
  fillPeriodData: (input: unknown) => fillPeriodData(input),
}))

const PERIOD: AnalyticsPeriod = {
  preset: '30d',
  start: '2026-07-20',
  end: '2026-08-18',
  prevStart: '2026-06-20',
  prevEnd: '2026-07-19',
  days: 30,
}

beforeEach(() => vi.clearAllMocks())

describe('AutoFill', () => {
  it('fires the fill once for a window and refreshes when data landed', async () => {
    fillPeriodData.mockResolvedValue({ ok: true, data: { filled: true } })
    const { rerender } = render(<AutoFill clientId="c1" period={PERIOD} unfilledDays={12} />)

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(fillPeriodData).toHaveBeenCalledTimes(1)
    expect(fillPeriodData).toHaveBeenCalledWith({
      clientId: 'c1',
      preset: '30d',
      start: '2026-07-20',
      end: '2026-08-18',
    })

    // Same window, same count — a re-render must NOT re-spend the budget…
    rerender(<AutoFill clientId="c1" period={PERIOD} unfilledDays={12} />)
    expect(fillPeriodData).toHaveBeenCalledTimes(1)

    // …but a dropped count means progress: the chain continues.
    rerender(<AutoFill clientId="c1" period={PERIOD} unfilledDays={4} />)
    await waitFor(() => expect(fillPeriodData).toHaveBeenCalledTimes(2))
  })

  it('does not refresh when nothing was filled — no render loop', async () => {
    fillPeriodData.mockResolvedValue({ ok: true, data: { filled: false } })
    render(<AutoFill clientId="c1" period={PERIOD} unfilledDays={12} />)

    await waitFor(() => expect(fillPeriodData).toHaveBeenCalledTimes(1))
    expect(refresh).not.toHaveBeenCalled()
  })
})
