import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  startCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  assign: vi.fn(),
}))
vi.mock('@/features/settings/actions/billing-actions', () => ({
  startCheckout: mocks.startCheckout,
  openBillingPortal: mocks.openBillingPortal,
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('@/features/settings/components/plan-end-control', () => ({
  PlanEndControl: ({ ending }: { ending: boolean }) => (
    <button type="button">{ending ? 'Keep plan' : 'Cancel plan'}</button>
  ),
}))

import { PlanActions } from '../plan-actions'

const SUMMARY = '€19.00 a month per client · 3 clients today'
/** The plan's end is `PlanEndControl`'s own test; here it only has to appear beside the portal. */
const END = {
  ending: false,
  cancelConsequence: 'Your plan ends on 1 October and nothing more is charged.',
}

describe('PlanActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', { value: { assign: mocks.assign }, writable: true })
  })

  it('offers Checkout with the billing sentence while the workspace does not pay', async () => {
    mocks.startCheckout.mockResolvedValue({
      ok: true,
      data: { url: 'https://checkout.stripe.com/c/1' },
    })
    render(<PlanActions state="trial" plan="trial" summary={SUMMARY} {...END} />)
    expect(screen.getByText(SUMMARY)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }))
    await act(async () => {})
    expect(mocks.assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/1')
  })

  it('offers the plan’s end and the portal to a paying workspace, and nothing to a house one', () => {
    const { unmount } = render(<PlanActions state="active" plan="pro" summary={SUMMARY} {...END} />)
    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument()
    expect(screen.queryByText(SUMMARY)).not.toBeInTheDocument()
    unmount()
    const { container } = render(
      <PlanActions state="active" plan="house" summary={SUMMARY} {...END} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a refusal as a toast and stays put', async () => {
    mocks.openBillingPortal.mockResolvedValue({
      ok: false,
      error: 'Only admins can manage the plan.',
    })
    render(<PlanActions state="past_due" plan="pro" summary={SUMMARY} {...END} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }))
    await act(async () => {})
    expect(mocks.toast.error).toHaveBeenCalledWith('Only admins can manage the plan.')
    expect(mocks.assign).not.toHaveBeenCalled()
  })
})
