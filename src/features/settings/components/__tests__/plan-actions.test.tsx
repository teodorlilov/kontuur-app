import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  startCheckout: vi.fn(),
  openBillingPortal: vi.fn(),
  setClientSlotsAction: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  assign: vi.fn(),
}))
vi.mock('@/features/settings/actions/billing-actions', () => ({
  startCheckout: mocks.startCheckout,
  openBillingPortal: mocks.openBillingPortal,
  setClientSlotsAction: mocks.setClientSlotsAction,
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/features/settings/components/plan-end-control', () => ({
  PlanEndControl: ({ ending }: { ending: boolean }) => (
    <button type="button">{ending ? 'Keep plan' : 'Cancel plan'}</button>
  ),
}))

import { PlanActions } from '../plan-actions'
import type { SlotsState } from '@/features/settings/lib/slots-state'

/** The plan's end is `PlanEndControl`'s own test; here it only has to appear beside the portal. */
const END = {
  ending: false,
  cancelConsequence: 'Your plan ends on 1 October.',
}

const CHECKOUT: SlotsState = { phase: 'checkout', clientCount: 3 }
const RUNNING: SlotsState = {
  phase: 'change',
  clientCount: 2,
  ordered: 3,
  paid: 3,
  period: { start: '2026-09-29T00:00:00Z', end: '2026-10-29T00:00:00Z' },
  timezone: 'Europe/Sofia',
}

describe('PlanActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', { value: { assign: mocks.assign }, writable: true })
  })

  it('sends the count the admin chose to Checkout while no subscription is open', async () => {
    mocks.startCheckout.mockResolvedValue({
      ok: true,
      data: { url: 'https://checkout.stripe.com/c/1' },
    })
    render(<PlanActions subscriptionOpen={false} slots={CHECKOUT} {...END} />)
    expect(screen.getByText('3 clients × €29.00 = €87.00 a month excl. VAT')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Choose plan' }))
    await act(async () => {})
    expect(mocks.startCheckout).toHaveBeenCalledWith(3)
    expect(mocks.assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/1')
  })

  it('offers the slots, the plan’s end and the portal while a subscription is open, never Checkout', () => {
    render(<PlanActions subscriptionOpen slots={RUNNING} {...END} />)
    expect(screen.getByText('Client slots')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose plan' })).not.toBeInTheDocument()
  })

  it('offers a house workspace the end of an open subscription, and nothing without one', () => {
    const { unmount } = render(<PlanActions subscriptionOpen slots={null} {...END} />)
    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeInTheDocument()
    expect(screen.queryByText('Client slots')).not.toBeInTheDocument()
    unmount()
    const { container } = render(<PlanActions subscriptionOpen={false} slots={null} {...END} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a refusal as a toast and stays put', async () => {
    mocks.openBillingPortal.mockResolvedValue({
      ok: false,
      error: 'Only admins can manage the plan.',
    })
    render(<PlanActions subscriptionOpen slots={RUNNING} {...END} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }))
    await act(async () => {})
    expect(mocks.toast.error).toHaveBeenCalledWith('Only admins can manage the plan.')
    expect(mocks.assign).not.toHaveBeenCalled()
  })
})
