import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

const mocks = vi.hoisted(() => ({ listLineItems: vi.fn(), autoPagingToArray: vi.fn() }))

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('stripe', () => ({
  default: class {
    invoices = { listLineItems: mocks.listLineItems }
  },
}))

import { invoiceLines } from '../stripe'

/** WHY as: a line carries dozens of fields; `invoiceLines` passes them through untouched. */
const line = (id: string) => ({ id }) as Stripe.InvoiceLineItem

/** WHY as: an invoice carries dozens of fields; `invoiceLines` reads its id and its lines. */
const invoice = (data: Stripe.InvoiceLineItem[], hasMore: boolean) =>
  ({ id: 'in_1', lines: { data, has_more: hasMore } }) as unknown as Stripe.Invoice

describe('invoiceLines', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_1')
    mocks.listLineItems.mockReset().mockReturnValue({ autoPagingToArray: mocks.autoPagingToArray })
    mocks.autoPagingToArray.mockReset()
  })

  it('keeps the embedded lines when Stripe says there are no more, with no request', async () => {
    const embedded = [line('il_1'), line('il_2')]
    expect(await invoiceLines(invoice(embedded, false))).toBe(embedded)
    expect(mocks.listLineItems).not.toHaveBeenCalled()
  })

  it('pages every line in when the embedded list stops short, so the renewal line behind many prorations is kept', async () => {
    const every = [line('il_1'), line('il_2'), line('il_renewal')]
    mocks.autoPagingToArray.mockResolvedValue(every)
    expect(await invoiceLines(invoice([line('il_1')], true))).toBe(every)
    expect(mocks.listLineItems).toHaveBeenCalledWith('in_1', { limit: 100 })
    expect(mocks.autoPagingToArray).toHaveBeenCalledWith({ limit: 10_000 })
  })
})
