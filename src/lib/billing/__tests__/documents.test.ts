import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'

const mocks = vi.hoisted(() => ({
  invoicesRetrieve: vi.fn(),
  taxRatesRetrieve: vi.fn(),
  creditNotesRetrieve: vi.fn(),
  fetchSaleDocumentById: vi.fn(),
  fetchSaleDocumentByStripeInvoice: vi.fn(),
  fetchUndeliveredSaleDocuments: vi.fn(),
  sendEmail: vi.fn(),
  renderPdf: vi.fn(),
  renderSaleDocumentHtml: vi.fn(),
}))
vi.mock('../stripe', () => ({
  stripeClient: () => ({
    invoices: { retrieve: mocks.invoicesRetrieve },
    taxRates: { retrieve: mocks.taxRatesRetrieve },
    creditNotes: { retrieve: mocks.creditNotesRetrieve },
  }),
}))
vi.mock('@/lib/queries/db', () => ({
  fetchSaleDocumentById: mocks.fetchSaleDocumentById,
  fetchSaleDocumentByStripeInvoice: mocks.fetchSaleDocumentByStripeInvoice,
  fetchUndeliveredSaleDocuments: mocks.fetchUndeliveredSaleDocuments,
}))
vi.mock('@/lib/email/resend', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/render/pdf', () => ({ renderPdf: mocks.renderPdf }))
vi.mock('../document-render', () => ({ renderSaleDocumentHtml: mocks.renderSaleDocumentHtml }))

import {
  deliverSaleDocument,
  issueCreditNote,
  issueSaleDocument,
  listDocumentDownloads,
  retryUndeliveredDocuments,
  vatBasisOf,
} from '../documents'

/**
 * A recorder in place of the admin client: the RPC echoes its input back as a row with a number,
 * uploads and updates are kept. Cast through `unknown` because only what the module calls exists.
 */
function makeAdmin(
  options: { uploadError?: string; signed?: Array<{ path: string; signedUrl: string }> } = {}
) {
  const rpc: Array<Record<string, unknown>> = []
  const updates: Array<{ values: Record<string, unknown>; id: string }> = []
  const uploads: Array<{ path: string; contentType: string }> = []
  let pending: Record<string, unknown> | null = null
  const admin = {
    rpc: (_name: string, args: { p: Record<string, unknown> }) => {
      rpc.push(args.p)
      return Promise.resolve({
        data: { id: 'doc_1', number: 1_000_000_001, ...args.p },
        error: null,
      })
    },
    from: () => ({
      update: (values: Record<string, unknown>) => {
        pending = values
        return {
          eq: (_column: string, id: string) => {
            updates.push({ values: pending!, id })
            return Promise.resolve({ error: null })
          },
        }
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string, _bytes: Buffer, opts: { contentType: string }) => {
          uploads.push({ path, contentType: opts.contentType })
          return Promise.resolve({
            error: options.uploadError ? { message: options.uploadError } : null,
          })
        },
        createSignedUrls: () => Promise.resolve({ data: options.signed ?? [], error: null }),
      }),
    },
  }
  return { admin: admin as unknown as SupabaseClient, rpc, updates, uploads }
}

const TAX_20 = {
  amount: 380,
  taxability_reason: 'standard_rated',
  tax_rate_details: { tax_rate: 'txr_bg' },
} as unknown as Stripe.Invoice.TotalTax

function invoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  // WHY as: the SDK type carries a hundred fields; the issuer reads a dozen.
  return {
    id: 'in_1',
    currency: 'eur',
    amount_paid: 2280,
    total: 2280,
    subtotal: 1900,
    total_excluding_tax: 1900,
    created: 1_759_276_800,
    status_transitions: { paid_at: 1_759_280_400 },
    customer_name: 'Acme OOD',
    customer_email: 'billing@acme.bg',
    customer_address: {
      line1: 'bul. Vitosha 1',
      line2: null,
      city: 'Sofia',
      postal_code: '1000',
      state: null,
      country: 'BG',
    },
    customer_tax_ids: [{ type: 'eu_vat', value: 'BG123456789' }],
    total_taxes: [TAX_20],
    payments: { data: [{ payment: { payment_intent: { id: 'pi_1', latest_charge: 'ch_1' } } }] },
    lines: {
      data: [
        {
          description: '1 × Kontuur (at €19.00 / month)',
          quantity: 1,
          amount: 1900,
          pricing: { unit_amount_decimal: '1900' },
          period: { start: 1_759_276_800, end: 1_761_868_800 },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Invoice
}

const DOCUMENT: SaleDocumentColumns = {
  id: 'doc_1',
  number: 1_000_000_001,
  kind: 'invoice',
  agency_id: 'a1',
  stripe_invoice_id: 'in_1',
  stripe_credit_note_id: null,
  stripe_charge_id: 'ch_1',
  stripe_refund_id: null,
  refunds: null,
  issued_at: '2025-10-01T01:00:00.000Z',
  customer: { name: 'Acme OOD', email: 'billing@acme.bg', address: null, taxIds: [] },
  lines: [],
  net_cents: 1900,
  vat_cents: 380,
  gross_cents: 2280,
  vat_rate: 20,
  vat_basis: 'domestic',
  storage_path: null,
  delivered_at: null,
  delivery_error: null,
  created_at: '2025-10-01T01:00:05.000Z',
}

describe('vatBasisOf — the legal basis of the VAT line', () => {
  const rate = (country: string) => ({ country, percentage: 20 }) as unknown as Stripe.TaxRate
  const tax = (reason: string) =>
    ({ taxability_reason: reason }) as unknown as Stripe.Invoice.TotalTax

  it('is domestic when the rate is Bulgaria’s, whatever the address — the small-seller case', () => {
    expect(vatBasisOf(tax('standard_rated'), rate('BG'), 'BG')).toBe('domestic')
    expect(vatBasisOf(tax('standard_rated'), rate('BG'), 'DE')).toBe('domestic')
  })

  it('is OSS when another member state’s rate was charged, and reverse charge when Stripe says so', () => {
    expect(vatBasisOf(tax('standard_rated'), rate('DE'), 'DE')).toBe('oss')
    expect(vatBasisOf(tax('reverse_charge'), null, 'DE')).toBe('reverse_charge')
  })

  it('is outside the EU only when no tax was collected from a non-EU customer', () => {
    expect(vatBasisOf(tax('not_collecting'), null, 'MK')).toBe('outside_eu')
    expect(vatBasisOf(null, null, 'US')).toBe('outside_eu')
  })

  it('refuses the cases it cannot name — VAT due and not charged, or a rate from outside the EU', () => {
    expect(() => vatBasisOf(tax('not_collecting'), null, 'DE')).toThrow(/VAT was due/)
    expect(() => vatBasisOf(tax('standard_rated'), rate('US'), 'US')).toThrow(/tax rate country US/)
    expect(() => vatBasisOf(tax('customer_exempt'), null, 'BG')).toThrow(/customer_exempt/)
  })
})

describe('issueSaleDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invoicesRetrieve.mockResolvedValue(invoice())
    mocks.taxRatesRetrieve.mockResolvedValue({ id: 'txr_bg', country: 'BG', percentage: 20 })
  })

  it('snapshots the payer, the lines, the totals, the basis and the charge onto one row', async () => {
    const { admin, rpc } = makeAdmin()
    const document = await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })

    expect(mocks.invoicesRetrieve).toHaveBeenCalledWith('in_1', {
      expand: ['payments.data.payment.payment_intent'],
    })
    expect(mocks.taxRatesRetrieve).toHaveBeenCalledWith('txr_bg')
    expect(document?.number).toBe(1_000_000_001)
    expect(rpc[0]).toMatchObject({
      kind: 'invoice',
      agency_id: 'a1',
      stripe_invoice_id: 'in_1',
      stripe_charge_id: 'ch_1',
      issued_at: '2025-10-01T01:00:00.000Z',
      net_cents: 1900,
      vat_cents: 380,
      gross_cents: 2280,
      vat_rate: 20,
      vat_basis: 'domestic',
      customer: {
        name: 'Acme OOD',
        email: 'billing@acme.bg',
        address: expect.objectContaining({ city: 'Sofia', country: 'BG' }),
        taxIds: [{ type: 'eu_vat', value: 'BG123456789' }],
      },
      lines: [
        {
          description: '1 × Kontuur (at €19.00 / month)',
          quantity: 1,
          unitCents: 1900,
          netCents: 1900,
          periodStart: '2025-10-01T00:00:00.000Z',
          periodEnd: '2025-10-31T00:00:00.000Z',
        },
      ],
    })
  })

  it('a payment with no workspace left to own it still becomes a document, from the snapshot alone', async () => {
    const { admin, rpc } = makeAdmin()
    const document = await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: null })
    expect(document?.number).toBe(1_000_000_001)
    expect(rpc[0]).toMatchObject({ kind: 'invoice', agency_id: null, stripe_invoice_id: 'in_1' })
  })

  it('a German company on reverse charge, a German consumer under OSS, a Skopje company outside the EU', async () => {
    const { admin, rpc } = makeAdmin()
    mocks.invoicesRetrieve.mockResolvedValue(
      invoice({
        total: 1900,
        amount_paid: 1900,
        customer_address: { country: 'DE' },
        total_taxes: [{ amount: 0, taxability_reason: 'reverse_charge', tax_rate_details: null }],
      })
    )
    await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })
    expect(rpc[0]).toMatchObject({ vat_basis: 'reverse_charge', vat_cents: 0, vat_rate: 0 })
    expect(mocks.taxRatesRetrieve).not.toHaveBeenCalled()

    mocks.taxRatesRetrieve.mockResolvedValue({ id: 'txr_de', country: 'DE', percentage: 19 })
    mocks.invoicesRetrieve.mockResolvedValue(
      invoice({
        total: 2261,
        amount_paid: 2261,
        customer_address: { country: 'DE' },
        total_taxes: [
          {
            amount: 361,
            taxability_reason: 'standard_rated',
            tax_rate_details: { tax_rate: 'txr_de' },
          },
        ],
      })
    )
    await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })
    expect(rpc[1]).toMatchObject({ vat_basis: 'oss', vat_cents: 361, vat_rate: 19 })

    mocks.invoicesRetrieve.mockResolvedValue(
      invoice({
        total: 1900,
        amount_paid: 1900,
        customer_address: { country: 'MK' },
        total_taxes: [{ amount: 0, taxability_reason: 'not_collecting', tax_rate_details: null }],
      })
    )
    await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })
    expect(rpc[2]).toMatchObject({ vat_basis: 'outside_eu' })
  })

  it('issues nothing for a €0 invoice, and refuses a foreign currency or an uncharged EU sale', async () => {
    const { admin, rpc } = makeAdmin()
    mocks.invoicesRetrieve.mockResolvedValue(invoice({ amount_paid: 0 }))
    expect(await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })).toBeNull()

    mocks.invoicesRetrieve.mockResolvedValue(invoice({ currency: 'usd' }))
    await expect(issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })).rejects.toThrow(
      /euro only/
    )

    mocks.invoicesRetrieve.mockResolvedValue(
      invoice({
        customer_address: { country: 'DE' },
        total_taxes: [{ amount: 0, taxability_reason: 'not_collecting', tax_rate_details: null }],
      })
    )
    await expect(issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })).rejects.toThrow(
      /VAT was due/
    )
    expect(rpc).toEqual([])
  })
})

describe('issueCreditNote', () => {
  const note = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'cn_1',
      type: 'post_payment',
      currency: 'eur',
      invoice: 'in_1',
      created: 1_760_000_000,
      subtotal: 950,
      total: 1140,
      total_taxes: [{ amount: 190 }],
      refunds: [{ refund: 're_1', amount_refunded: 1140 }],
      ...overrides,
    }) as unknown as Stripe.CreditNote

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchSaleDocumentByStripeInvoice.mockResolvedValue(DOCUMENT)
  })

  it('refunds the invoice document by reference, keeping its customer, basis and rate', async () => {
    mocks.creditNotesRetrieve.mockResolvedValue(note())
    const { admin, rpc } = makeAdmin()
    const document = await issueCreditNote(admin, 'cn_1')
    expect(document?.kind).toBe('credit_note')
    expect(rpc[0]).toMatchObject({
      kind: 'credit_note',
      agency_id: 'a1',
      stripe_invoice_id: 'in_1',
      stripe_credit_note_id: 'cn_1',
      stripe_charge_id: 'ch_1',
      stripe_refund_id: 're_1',
      refunds: 'doc_1',
      customer: DOCUMENT.customer,
      net_cents: 950,
      vat_cents: 190,
      gross_cents: 1140,
      vat_rate: 20,
      vat_basis: 'domestic',
    })
    expect((rpc[0]?.lines as Array<{ description: string }>)[0]?.description).toMatch(
      /0000000001\b|1000000001/
    )
  })

  it('issues nothing for a pre-payment note or a credit to the balance — no money moved', async () => {
    const { admin, rpc } = makeAdmin()
    mocks.creditNotesRetrieve.mockResolvedValue(note({ type: 'pre_payment' }))
    expect(await issueCreditNote(admin, 'cn_1')).toBeNull()
    mocks.creditNotesRetrieve.mockResolvedValue(note({ refunds: [] }))
    expect(await issueCreditNote(admin, 'cn_1')).toBeNull()
    expect(rpc).toEqual([])
  })

  it('refuses to credit an invoice it never documented', async () => {
    mocks.creditNotesRetrieve.mockResolvedValue(note())
    mocks.fetchSaleDocumentByStripeInvoice.mockResolvedValue(null)
    await expect(issueCreditNote(makeAdmin().admin, 'cn_1')).rejects.toThrow(/has no document/)
  })
})

describe('deliverSaleDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.fetchSaleDocumentById.mockResolvedValue(DOCUMENT)
    mocks.renderSaleDocumentHtml.mockResolvedValue('<html>')
    mocks.renderPdf.mockResolvedValue(Buffer.from('%PDF'))
    mocks.sendEmail.mockResolvedValue(undefined)
  })

  it('prints, stores, mails once with the key that makes a retry harmless, and stamps the row', async () => {
    const { admin, uploads, updates } = makeAdmin()
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('delivered')
    expect(uploads).toEqual([{ path: 'a1/1000000001.pdf', contentType: 'application/pdf' }])
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@acme.bg',
        attachments: [{ filename: 'kontuur-1000000001.pdf', content: Buffer.from('%PDF') }],
        idempotencyKey: 'document:doc_1',
      })
    )
    expect(updates[0]).toMatchObject({
      id: 'doc_1',
      values: { storage_path: 'a1/1000000001.pdf', delivery_error: null },
    })
    expect(typeof updates[0]?.values.delivered_at).toBe('string')
  })

  it('records a failure on the row and reports it, never throwing', async () => {
    const { admin, updates } = makeAdmin({ uploadError: 'bucket missing' })
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('failed')
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(updates[0]).toEqual({
      id: 'doc_1',
      values: { delivery_error: 'document upload failed: bucket missing' },
    })
  })

  it('never re-sends a document that was delivered', async () => {
    mocks.fetchSaleDocumentById.mockResolvedValue({
      ...DOCUMENT,
      delivered_at: '2025-10-01T01:01:00.000Z',
    })
    const { admin, uploads } = makeAdmin()
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('delivered')
    expect(uploads).toEqual([])
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})

describe('retryUndeliveredDocuments and listDocumentDownloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.renderSaleDocumentHtml.mockResolvedValue('<html>')
    mocks.renderPdf.mockResolvedValue(Buffer.from('%PDF'))
    mocks.sendEmail.mockResolvedValue(undefined)
  })

  it('takes every stale undelivered document through delivery and counts the outcomes', async () => {
    mocks.fetchUndeliveredSaleDocuments.mockResolvedValue([DOCUMENT, { ...DOCUMENT, id: 'doc_2' }])
    mocks.fetchSaleDocumentById.mockImplementation(async (id: string) => ({ ...DOCUMENT, id }))
    expect(await retryUndeliveredDocuments(makeAdmin().admin)).toEqual({ retried: 2, delivered: 2 })
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('gives each stored document a signed link and the unstored ones none, in one call', async () => {
    const stored = { ...DOCUMENT, storage_path: 'a1/1000000001.pdf' }
    const { admin } = makeAdmin({
      signed: [{ path: 'a1/1000000001.pdf', signedUrl: 'https://signed/1' }],
    })
    const listed = await listDocumentDownloads(admin, [stored, { ...DOCUMENT, id: 'doc_2' }])
    expect(listed.map((document) => document.url)).toEqual(['https://signed/1', null])
  })
})
