import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  clearQueryParams: vi.fn(),
}))
const router = { refresh: () => mocks.refresh() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('@/utils/url', () => ({ clearQueryParams: mocks.clearQueryParams }))

import { CheckoutReturn } from '../checkout-return'

const ACTIVATED = {
  title: 'You’re on Pro',
  facts: [
    { label: 'Clients', value: '3' },
    { label: 'A month', value: '€57.00' },
    { label: 'Renews', value: '19 October 2026' },
  ],
  text: 'Invoice No. 1000000002 is on its way to owner@acme.bg and is listed under Invoices below.',
}

describe('CheckoutReturn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('renders nothing without a return flag, and polls nothing', async () => {
    const { container } = render(
      <CheckoutReturn billingReturn={null} paid={false} activated={ACTIVATED} />
    )
    await act(async () => {
      vi.advanceTimersByTime(20_000)
    })
    expect(container).toBeEmptyDOMElement()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.clearQueryParams).not.toHaveBeenCalled()
  })

  it('says the payment is received and refreshes until the plan shows', async () => {
    render(<CheckoutReturn billingReturn="success" paid={false} activated={ACTIVATED} />)
    expect(mocks.clearQueryParams).toHaveBeenCalledWith(['billing'])
    expect(screen.getByRole('status')).toHaveTextContent('Payment received')
    expect(screen.getByText('Activating')).toBeInTheDocument()
    expect(screen.getByText(/appears here in a few seconds/)).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(6_100)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('once the plan is live, names it with the facts and the invoice, then leaves on its own', async () => {
    const { rerender } = render(
      <CheckoutReturn billingReturn="success" paid={false} activated={ACTIVATED} />
    )
    rerender(<CheckoutReturn billingReturn="success" paid={true} activated={ACTIVATED} />)
    expect(screen.getByRole('status')).toHaveTextContent('You’re on Pro')
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('€57.00')).toBeInTheDocument()
    expect(screen.getByText('19 October 2026')).toBeInTheDocument()
    expect(
      screen.getByText(/Invoice No\. 1000000002 is on its way to owner@acme\.bg/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(8_100)
    })
    expect(screen.getByRole('status')).toHaveClass('opacity-0')
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('stops refreshing after a minute and says a refresh is the way', async () => {
    render(<CheckoutReturn billingReturn="success" paid={false} activated={ACTIVATED} />)
    await act(async () => {
      vi.advanceTimersByTime(63_100)
    })
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText(/refresh if it does not/)).toBeInTheDocument()
    const refreshes = mocks.refresh.mock.calls.length
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(mocks.refresh).toHaveBeenCalledTimes(refreshes)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('a cancelled Checkout is a toast and no card', () => {
    const { container } = render(
      <CheckoutReturn billingReturn="cancelled" paid={false} activated={ACTIVATED} />
    )
    expect(mocks.toast).toHaveBeenCalledWith('Checkout was cancelled — nothing was charged.')
    expect(mocks.clearQueryParams).toHaveBeenCalledWith(['billing'])
    expect(container).toBeEmptyDOMElement()
  })
})
