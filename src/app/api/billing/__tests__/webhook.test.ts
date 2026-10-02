import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  applySubscriptionSnapshot: vi.fn(),
  issueSaleDocument: vi.fn(),
  issueCreditNote: vi.fn(),
  deliverSaleDocument: vi.fn(),
  after: vi.fn((work: () => unknown) => void work()),
  remindPaymentFailed: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (work: () => unknown) => mocks.after(work),
}))
vi.mock('@/lib/billing/documents', async (importActual) => ({
  chargedMoney: (await importActual<typeof import('@/lib/billing/documents')>()).chargedMoney,
  issueSaleDocument: mocks.issueSaleDocument,
  issueCreditNote: mocks.issueCreditNote,
  deliverSaleDocument: mocks.deliverSaleDocument,
}))
vi.mock('@/lib/billing/reminders', () => ({
  remindPaymentFailed: mocks.remindPaymentFailed,
}))
vi.mock('@/lib/billing/stripe', () => ({
  stripeClient: () => ({
    webhooks: { constructEvent: mocks.constructEvent },
    subscriptions: { retrieve: mocks.retrieve },
  }),
}))
vi.mock('@/lib/billing/subscription-store', () => ({
  applySubscriptionSnapshot: mocks.applySubscriptionSnapshot,
}))

/** The billing_events table as a map, so a delivery can find what an earlier one left behind. */
const rows = new Map<
  string,
  { processed_at: string | null; error: string | null; agency_id: string | null }
>()
const admin = {
  from(table: string) {
    if (table !== 'billing_events') throw new Error(`unexpected table ${table}`)
    let pending: Record<string, unknown> | null = null
    const query = {
      upsert: (row: { id: string }) => {
        if (!rows.has(row.id))
          rows.set(row.id, { processed_at: null, error: null, agency_id: null })
        return Promise.resolve({ error: null })
      },
      select: () => query,
      update: (values: Record<string, unknown>) => {
        pending = values
        return query
      },
      eq: (_column: string, id: string) => {
        if (pending) {
          rows.set(id, { ...rows.get(id)!, ...pending } as never)
          pending = null
          return Promise.resolve({ error: null })
        }
        return {
          single: () => Promise.resolve({ data: rows.get(id) ?? null, error: null }),
        }
      },
    }
    return query
  },
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => admin }))

import { POST } from '../webhook/route'

function deliver(): Promise<Response> {
  return POST(
    new NextRequest('https://kontuur.app/api/billing/webhook', {
      method: 'POST',
      body: '{"raw":true}',
      headers: { 'stripe-signature': 't=1,v1=abc' },
    })
  )
}

function event(type: string, object: Record<string, unknown>, id = 'evt_1') {
  return { id, type, created: 1_760_000_000, data: { object } }
}

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    rows.clear()
    vi.clearAllMocks()
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mocks.retrieve.mockResolvedValue({ id: 'sub_1' })
    mocks.applySubscriptionSnapshot.mockResolvedValue({ agencyId: 'a1', outcome: 'written' })
    mocks.issueSaleDocument.mockResolvedValue({ id: 'doc_1', agency_id: 'a1' })
    mocks.issueCreditNote.mockResolvedValue({ id: 'doc_2', agency_id: 'a1' })
    mocks.deliverSaleDocument.mockResolvedValue('delivered')
    mocks.remindPaymentFailed.mockResolvedValue({ outcome: 'emailed' })
  })

  it('rejects a body Stripe did not sign, before recording anything', async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found')
    })
    const response = await deliver()
    expect(response.status).toBe(400)
    expect(rows.size).toBe(0)
  })

  it('re-fetches the subscription an event names and writes the snapshot, then stamps the row done', async () => {
    mocks.constructEvent.mockReturnValue(event('customer.subscription.updated', { id: 'sub_1' }))
    const response = await deliver()
    expect(response.status).toBe(200)
    expect(mocks.retrieve).toHaveBeenCalledWith('sub_1')
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(admin, { id: 'sub_1' })
    expect(rows.get('evt_1')).toMatchObject({ agency_id: 'a1', error: null })
    expect(rows.get('evt_1')?.processed_at).toEqual(expect.any(String))
  })

  it('finds an invoice’s subscription through its parent, hands the paid invoice to the snapshot, issues the document and delivers it after the response', async () => {
    const renewal = {
      id: 'in_1',
      amount_paid: 1900,
      billing_reason: 'subscription_cycle',
      parent: { subscription_details: { subscription: 'sub_1' } },
    }
    mocks.constructEvent.mockReturnValue(event('invoice.paid', renewal))
    await deliver()
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledWith(admin, { id: 'sub_1' }, renewal)
    expect(mocks.issueSaleDocument).toHaveBeenCalledWith(admin, {
      invoiceId: 'in_1',
      agencyId: 'a1',
    })
    expect(mocks.after).toHaveBeenCalledTimes(1)
    expect(mocks.deliverSaleDocument).toHaveBeenCalledWith(admin, 'doc_1')
  })

  it('still issues the document for a payment that arrives after its workspace was deleted, with no owner', async () => {
    mocks.applySubscriptionSnapshot.mockResolvedValue({ agencyId: null, outcome: 'no_workspace' })
    mocks.issueSaleDocument.mockResolvedValue({ id: 'doc_9', agency_id: null })
    mocks.constructEvent.mockReturnValue(
      event('invoice.paid', {
        id: 'in_9',
        amount_paid: 1900,
        parent: { subscription_details: { subscription: 'sub_1' } },
      })
    )
    const res = await deliver()
    expect(res.status).toBe(200)
    expect(mocks.issueSaleDocument).toHaveBeenCalledWith(admin, {
      invoiceId: 'in_9',
      agencyId: null,
    })
    expect(mocks.deliverSaleDocument).toHaveBeenCalledWith(admin, 'doc_9')
    expect(rows.get('evt_1')).toMatchObject({ agency_id: null, error: null })
    expect(rows.get('evt_1')?.processed_at).not.toBeNull()
  })

  it('issues the document for a paid invoice of a subscription the row no longer owns', async () => {
    mocks.applySubscriptionSnapshot.mockResolvedValue({ agencyId: 'a1', outcome: 'ignored' })
    mocks.constructEvent.mockReturnValue(
      event('invoice.paid', {
        id: 'in_8',
        amount_paid: 1900,
        parent: { subscription_details: { subscription: 'sub_old' } },
      })
    )
    await deliver()
    expect(mocks.issueSaleDocument).toHaveBeenCalledWith(admin, {
      invoiceId: 'in_8',
      agencyId: 'a1',
    })
  })

  it('hands a €0 paid invoice to issueSaleDocument, so one a customer balance paid in full reaches its refusal, and issues nothing for a failed one', async () => {
    const parent = { subscription_details: { subscription: 'sub_1' } }
    mocks.issueSaleDocument.mockResolvedValueOnce(null)
    mocks.constructEvent.mockReturnValue(
      event('invoice.paid', { id: 'in_0', amount_paid: 0, parent })
    )
    await deliver()
    mocks.constructEvent.mockReturnValue(
      event('invoice.payment_failed', { id: 'in_2', amount_paid: 0, parent }, 'evt_2')
    )
    await deliver()
    expect(mocks.applySubscriptionSnapshot).toHaveBeenLastCalledWith(admin, { id: 'sub_1' })
    expect(mocks.issueSaleDocument).toHaveBeenCalledTimes(1)
    expect(mocks.issueSaleDocument).toHaveBeenCalledWith(admin, {
      invoiceId: 'in_0',
      agencyId: 'a1',
    })
    expect(mocks.deliverSaleDocument).not.toHaveBeenCalled()
    expect(mocks.remindPaymentFailed).toHaveBeenCalledWith(admin, 'a1')
    expect(mocks.remindPaymentFailed).toHaveBeenCalledTimes(1)
  })

  it('logs by invoice, never as ignored, a paid invoice that took money but belongs to no subscription this app made', async () => {
    mocks.constructEvent.mockReturnValue(
      event('invoice.paid', { id: 'in_hand', amount_paid: 5000, parent: null })
    )
    expect(await (await deliver()).json()).toEqual({
      received: true,
      outcome: 'undocumented_sale',
    })
    mocks.applySubscriptionSnapshot.mockResolvedValue({ agencyId: null, outcome: 'ignored' })
    mocks.constructEvent.mockReturnValue(
      event(
        'invoice.paid',
        {
          id: 'in_foreign',
          amount_paid: 5000,
          parent: { subscription_details: { subscription: 'sub_x' } },
        },
        'evt_2'
      )
    )
    expect(await (await deliver()).json()).toEqual({
      received: true,
      outcome: 'undocumented_sale',
    })
    expect(mocks.issueSaleDocument).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[billing:webhook] invoice.paid evt_1: undocumented_sale — invoice in_hand took 5000 cents and has no document'
    )
    expect(console.error).toHaveBeenCalledWith(
      '[billing:webhook] invoice.paid evt_2: undocumented_sale — invoice in_foreign took 5000 cents and has no document'
    )
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('logs how a failed payment’s reminder went on the event’s one line, at error level when it needs eyes', async () => {
    const parent = { subscription_details: { subscription: 'sub_1' } }
    mocks.constructEvent.mockReturnValue(
      event('invoice.payment_failed', { id: 'in_2', amount_paid: 0, parent })
    )
    await deliver()
    expect(console.info).toHaveBeenCalledWith(
      '[billing:webhook] invoice.payment_failed evt_1: written — reminder emailed'
    )

    mocks.remindPaymentFailed.mockResolvedValue({
      outcome: 'send_failed',
      error: 'domain not verified',
    })
    mocks.constructEvent.mockReturnValue(
      event('invoice.payment_failed', { id: 'in_3', amount_paid: 0, parent }, 'evt_2')
    )
    await deliver()
    expect(console.error).toHaveBeenCalledWith(
      '[billing:webhook] invoice.payment_failed evt_2: written — reminder send_failed: domain not verified'
    )
  })

  it('turns a credit note that refunded money into its document, and a pre-payment one into nothing', async () => {
    mocks.constructEvent.mockReturnValue(event('credit_note.created', { id: 'cn_1' }))
    expect(await (await deliver()).json()).toEqual({ received: true, outcome: 'credit_note' })
    expect(mocks.issueCreditNote).toHaveBeenCalledWith(admin, 'cn_1')
    expect(mocks.deliverSaleDocument).toHaveBeenCalledWith(admin, 'doc_2')

    mocks.issueCreditNote.mockResolvedValue(null)
    mocks.constructEvent.mockReturnValue(event('credit_note.created', { id: 'cn_2' }, 'evt_2'))
    expect(await (await deliver()).json()).toEqual({ received: true, outcome: 'ignored' })
  })

  it('answers a processed duplicate with 200 and does nothing again', async () => {
    mocks.constructEvent.mockReturnValue(event('customer.subscription.updated', { id: 'sub_1' }))
    await deliver()
    const again = await deliver()
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ received: true, duplicate: true })
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledTimes(1)
  })

  it('answers 500 with the error on the row, and runs the event again on Stripe’s retry', async () => {
    mocks.constructEvent.mockReturnValue(event('customer.subscription.created', { id: 'sub_1' }))
    mocks.applySubscriptionSnapshot.mockRejectedValueOnce(new Error('agency read failed'))
    const failed = await deliver()
    expect(failed.status).toBe(500)
    expect(rows.get('evt_1')).toMatchObject({ processed_at: null, error: 'agency read failed' })

    const retried = await deliver()
    expect(retried.status).toBe(200)
    expect(mocks.applySubscriptionSnapshot).toHaveBeenCalledTimes(2)
    expect(mocks.applySubscriptionSnapshot).toHaveBeenLastCalledWith(admin, { id: 'sub_1' })
    expect(rows.get('evt_1')?.error).toBeNull()
  })

  it("ignores an upcoming invoice: the slot count is only ever the admin's to change", async () => {
    mocks.constructEvent.mockReturnValue(
      event('invoice.upcoming', { parent: { subscription_details: { subscription: 'sub_1' } } })
    )
    expect(await (await deliver()).json()).toEqual({ received: true, outcome: 'ignored' })
    expect(mocks.retrieve).not.toHaveBeenCalled()
    expect(mocks.applySubscriptionSnapshot).not.toHaveBeenCalled()
    expect(rows.get('evt_1')?.processed_at).toEqual(expect.any(String))
  })

  it('logs a subscription conflict with both ids, once, at error level', async () => {
    mocks.applySubscriptionSnapshot.mockResolvedValue({
      agencyId: 'a1',
      outcome: 'conflict',
      detail: 'sub_2 arrived while sub_1 is open; nothing written',
      level: 'error',
    })
    mocks.constructEvent.mockReturnValue(event('customer.subscription.created', { id: 'sub_2' }))
    await deliver()
    expect(console.error).toHaveBeenCalledWith(
      '[billing:webhook] customer.subscription.created evt_1: conflict — sub_2 arrived while sub_1 is open; nothing written'
    )
  })

  it('records an event it does not act on, and an invoice with no subscription', async () => {
    mocks.constructEvent.mockReturnValue(event('customer.created', { id: 'cus_1' }))
    expect(await (await deliver()).json()).toEqual({ received: true, outcome: 'ignored' })
    mocks.constructEvent.mockReturnValue(
      event('invoice.paid', { id: 'in_2', amount_paid: 0, parent: null }, 'evt_2')
    )
    expect(await (await deliver()).json()).toEqual({ received: true, outcome: 'ignored' })
    expect(mocks.applySubscriptionSnapshot).not.toHaveBeenCalled()
  })

  it('refuses to run without a webhook secret rather than trusting the body', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    expect((await deliver()).status).toBe(503)
    expect(mocks.constructEvent).not.toHaveBeenCalled()
  })
})
