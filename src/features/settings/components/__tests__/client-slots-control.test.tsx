import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The one place the number of clients paid for is chosen: before a first Checkout the count
 * Checkout sells, on a running plan the slots, changed only behind a confirm that says what is
 * charged. The confirm's sentences are copy.ts's own tests; here they only have to appear.
 */
const mocks = vi.hoisted(() => ({
  setClientSlotsAction: vi.fn(),
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/features/settings/actions/billing-actions', () => ({
  setClientSlotsAction: (input: unknown) => mocks.setClientSlotsAction(input),
}))
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { ClientSlotsControl } from '../client-slots-control'
import type { SlotsState } from '@/features/settings/lib/slots-state'
import { formatLongDate } from '@/utils/format'

const DAY_MS = 86_400_000
const PERIOD = {
  start: new Date(Date.now() - 10 * DAY_MS).toISOString(),
  end: new Date(Date.now() + 20 * DAY_MS).toISOString(),
}

/** A running agency plan paying for 3 slots, with 2 clients. */
function change(overrides: Partial<Extract<SlotsState, { phase: 'change' }>> = {}): SlotsState {
  return {
    phase: 'change',
    clientCount: 2,
    ordered: 3,
    paid: 3,
    period: PERIOD,
    timezone: 'Europe/Sofia',
    ...overrides,
  }
}

function renderControl(state: SlotsState, start = vi.fn()) {
  render(<ClientSlotsControl state={state} checkout={{ busy: false, start }} />)
  return start
}

describe('ClientSlotsControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setClientSlotsAction.mockResolvedValue({ ok: true, data: { outcome: 'charged' } })
  })

  it('starts a first Checkout at the client count, never below it, and buys the chosen count', async () => {
    const user = userEvent.setup()
    const start = renderControl({ phase: 'checkout', clientCount: 2 })
    expect(screen.getByText('Clients to pay for')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One slot fewer' })).toBeDisabled()
    expect(screen.getByText('You have 2 clients, so you pay for at least 2.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'One slot more' }))
    expect(screen.getByText('3 clients × €29.00 = €87.00 a month excl. VAT')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose plan' }))
    expect(start).toHaveBeenCalledWith(3)
  })

  it('lets a workspace with no clients buy one slot at least', () => {
    renderControl({ phase: 'checkout', clientCount: 0 })
    expect(screen.getByText('1 client × €29.00 = €29.00 a month excl. VAT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One slot fewer' })).toBeDisabled()
  })

  it('shows a solo workspace its one business and buys one, with no stepper', async () => {
    const user = userEvent.setup()
    const start = renderControl({ phase: 'solo', checkout: true })
    expect(screen.getByText('€29.00 a month excl. VAT for your business')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'One slot more' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose plan' }))
    expect(start).toHaveBeenCalledWith(1)
  })

  it('offers Change on a running plan only once the count differs', async () => {
    const user = userEvent.setup()
    renderControl(change())
    expect(screen.getByText('Client slots')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose plan' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'One slot more' }))
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('confirms a raise before anything is charged, then says what the server did', async () => {
    const user = userEvent.setup()
    renderControl(change())
    await user.click(screen.getByRole('button', { name: 'One slot more' }))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Add 1 client slot')
    expect(dialog).toHaveTextContent('is charged today for the rest of this period')
    expect(mocks.setClientSlotsAction).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Add slot' }))
    await waitFor(() =>
      expect(mocks.setClientSlotsAction).toHaveBeenCalledWith({
        from: 3,
        to: 4,
        periodStart: PERIOD.start,
      })
    )
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        'You now pay for 4 clients. The invoice for the rest of this period is on its way by email.'
      )
    )
  })

  it('says a lower refunds nothing, and backs out on Keep', async () => {
    const user = userEvent.setup()
    renderControl(change())
    await user.click(screen.getByRole('button', { name: 'One slot fewer' }))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Nothing is refunded')
    await user.click(screen.getByRole('button', { name: 'Keep 3' }))
    expect(mocks.setClientSlotsAction).not.toHaveBeenCalled()
  })

  it('stops a lower at the clients the workspace has', () => {
    renderControl(change({ ordered: 2, paid: 2 }))
    expect(screen.getByRole('button', { name: 'One slot fewer' })).toBeDisabled()
  })

  it('shows a refusal as a toast and keeps the confirm open', async () => {
    mocks.setClientSlotsAction.mockResolvedValue({
      ok: false,
      error: 'Another change to your plan is in progress. Try again in a moment.',
    })
    const user = userEvent.setup()
    renderControl(change())
    await user.click(screen.getByRole('button', { name: 'One slot more' }))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add slot' }))
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        'Another change to your plan is in progress. Try again in a moment.'
      )
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('says when a lower waits for the renewal, on the renewal day in the workspace zone', () => {
    renderControl(change({ ordered: 2, paid: 3 }))
    const renewal = formatLongDate(new Date(PERIOD.end), 'Europe/Sofia')
    expect(screen.getByText(`You pay for 3 until ${renewal}, then 2.`)).toBeInTheDocument()
  })

  it('restores up to what the period paid for, saying nothing is charged today', async () => {
    const user = userEvent.setup()
    renderControl(change({ ordered: 2, paid: 3 }))
    await user.click(screen.getByRole('button', { name: 'One slot more' }))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'You already paid for 3 this period, so nothing is charged today.'
    )
  })

  it('stops a raise at fifty, but lets a count set higher by hand in Stripe come down', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <ClientSlotsControl
        state={change({ ordered: 50, paid: 50 })}
        checkout={{ busy: false, start: vi.fn() }}
      />
    )
    expect(screen.getByRole('button', { name: 'One slot more' })).toBeDisabled()
    unmount()
    renderControl(change({ ordered: 60, paid: 60 }))
    expect(screen.getByRole('button', { name: 'One slot more' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'One slot fewer' }))
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('shows a paid solo workspace its one business, with no stepper and nothing to buy', () => {
    renderControl({ phase: 'solo', checkout: false })
    expect(screen.getByText('€29.00 a month excl. VAT for your business')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'One slot more' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose plan' })).not.toBeInTheDocument()
  })

  it('refreshes a page left open past its period instead of pricing a period that has ended', async () => {
    const user = userEvent.setup()
    const ended = new Date(Date.now() - DAY_MS).toISOString()
    renderControl(change({ period: { start: PERIOD.start, end: ended } }))
    await user.click(screen.getByRole('button', { name: 'One slot more' }))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })

  it('goes from more clients than slots straight to the count the clients need, never between', async () => {
    const user = userEvent.setup()
    renderControl(change({ ordered: 1, paid: 1, clientCount: 3 }))
    expect(screen.getByRole('button', { name: 'One slot fewer' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'One slot more' }))
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Add 2 client slots')
  })

  it('says why the slots cannot change now, with no stepper', () => {
    renderControl({
      phase: 'unavailable',
      sentence:
        'Your plan is renewing, and its payment is taken within about an hour. Reload this page after that to change your client slots.',
    })
    expect(screen.getByText(/Your plan is renewing/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'One slot more' })).not.toBeInTheDocument()
  })
})
