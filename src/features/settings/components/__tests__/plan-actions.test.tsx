import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  startCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  clearQueryParams: vi.fn(),
  assign: vi.fn(),
}))
vi.mock('@/features/settings/actions/billing-actions', () => ({
  startCheckout: mocks.startCheckout,
  openBillingPortal: mocks.openBillingPortal,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('@/utils/url', () => ({ clearQueryParams: mocks.clearQueryParams }))

import { PlanActions } from '../plan-actions'

const SUMMARY = '€19.00 a month per client · 3 clients today'

describe('PlanActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', { value: { assign: mocks.assign }, writable: true })
  })
  afterEach(() => vi.useRealTimers())

  it('offers Checkout with the billing sentence while the workspace does not pay', async () => {
    mocks.startCheckout.mockResolvedValue({
      ok: true,
      data: { url: 'https://checkout.stripe.com/c/1' },
    })
    render(<PlanActions state="trial" plan="trial" summary={SUMMARY} billingReturn={null} />)
    expect(screen.getByText(SUMMARY)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }))
    await act(async () => {})
    expect(mocks.assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/1')
  })

  it('offers the portal to a paying workspace, and nothing to a house one', () => {
    const { unmount } = render(
      <PlanActions state="active" plan="pro" summary={SUMMARY} billingReturn={null} />
    )
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument()
    expect(screen.queryByText(SUMMARY)).not.toBeInTheDocument()
    unmount()
    const { container } = render(
      <PlanActions state="active" plan="house" summary={SUMMARY} billingReturn={null} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a refusal as a toast and stays put', async () => {
    mocks.openBillingPortal.mockResolvedValue({
      ok: false,
      error: 'Only admins can manage the plan.',
    })
    render(<PlanActions state="past_due" plan="pro" summary={SUMMARY} billingReturn={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }))
    await act(async () => {})
    expect(mocks.toast.error).toHaveBeenCalledWith('Only admins can manage the plan.')
    expect(mocks.assign).not.toHaveBeenCalled()
  })

  it('after a successful Checkout, clears the flag, says so, and refreshes until the plan shows', async () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <PlanActions state="trial" plan="trial" summary={SUMMARY} billingReturn="success" />
    )
    expect(mocks.clearQueryParams).toHaveBeenCalledWith(['billing'])
    expect(mocks.toast.success).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(4_100)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    rerender(<PlanActions state="active" plan="pro" summary={SUMMARY} billingReturn={null} />)
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('a cancelled Checkout is said once and polls nothing', async () => {
    vi.useFakeTimers()
    render(<PlanActions state="trial" plan="trial" summary={SUMMARY} billingReturn="cancelled" />)
    expect(mocks.toast).toHaveBeenCalledWith('Checkout was cancelled — nothing was charged.')
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
