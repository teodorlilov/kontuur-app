import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AudienceCapture } from '../components/audience-capture'
import type { AnalyticsPeriod } from '../lib/period'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}))

const ensureAudienceSnapshot = vi.fn()
// Wrapped rather than passed by reference: vi.mock is hoisted above the const.
vi.mock('../actions/report-actions', () => ({
  ensureAudienceSnapshot: (input: unknown) => ensureAudienceSnapshot(input),
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

describe('AudienceCapture', () => {
  it('asks for the snapshot once and refreshes when it lands', async () => {
    ensureAudienceSnapshot.mockResolvedValue({ ok: true, data: { captured: true } })
    const { rerender } = render(<AudienceCapture clientId="c1" period={PERIOD} />)

    expect(screen.getByRole('status')).toHaveTextContent('Capturing your audience')
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(ensureAudienceSnapshot).toHaveBeenCalledWith({
      clientId: 'c1',
      preset: '30d',
      start: '2026-07-20',
      end: '2026-08-18',
    })

    // A re-render must never re-spend the eight breakdown calls.
    rerender(<AudienceCapture clientId="c1" period={PERIOD} />)
    expect(ensureAudienceSnapshot).toHaveBeenCalledTimes(1)
  })

  it('says so plainly when Instagram returned nothing — and never loops', async () => {
    ensureAudienceSnapshot.mockResolvedValue({ ok: true, data: { captured: false } })
    render(<AudienceCapture clientId="c1" period={PERIOD} />)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('did not return audience demographics')
    )
    expect(refresh).not.toHaveBeenCalled()
  })
})
