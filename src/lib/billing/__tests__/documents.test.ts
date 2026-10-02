import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { AdminClient } from '@/lib/supabase/admin'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'

const mocks = vi.hoisted(() => ({
  invoicesRetrieve: vi.fn(),
  taxRatesRetrieve: vi.fn(),
  creditNotesRetrieve: vi.fn(),
  sendEmail: vi.fn(),
  renderPdf: vi.fn(),
  renderSaleDocumentHtml: vi.fn(),
}))
vi.mock('../stripe', () => ({
  invoiceLines: (invoice: Stripe.Invoice) => Promise.resolve(invoice.lines.data),
  stripeClient: () => ({
    invoices: { retrieve: mocks.invoicesRetrieve },
    taxRates: { retrieve: mocks.taxRatesRetrieve },
    creditNotes: { retrieve: mocks.creditNotesRetrieve },
  }),
}))
vi.mock('@/lib/email/resend', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/render/pdf', () => ({ renderPdf: mocks.renderPdf }))
vi.mock('../document-render', () => ({ renderSaleDocumentHtml: mocks.renderSaleDocumentHtml }))

import {
  chargedMoney,
  deliverSaleDocument,
  fetchSaleDocumentsBetween,
  issueCreditNote,
  issueSaleDocument,
  listDocumentDownloads,
  retryUndeliveredDocuments,
  vatBasisOf,
} from '../documents'

/** What a test tells the fake admin to fail. */
interface Failures {
  uploadError?: string
  /** The update whose values carry this key fails — `storage_path` or `delivered_at`. */
  updateFailsOn?: 'storage_path' | 'delivered_at'
}

/**
 * The admin client as the documents module uses it, over an in-memory `sale_documents`: the RPC
 * echoes its input back as a numbered row, reads filter, order and slice the rows, updates change
 * them, and the bucket keeps what was uploaded. WHY as: only the calls the module makes exist.
 */
function makeAdmin(rows: SaleDocumentColumns[] = [], failures: Failures = {}) {
  const rpc: Array<Record<string, unknown>> = []
  const updates: Array<{ values: Record<string, unknown>; id: string }> = []
  const bucket = new Map<string, Buffer>()
  const reads: Array<{ order: string[]; range: [number, number] | null }> = []

  function select() {
    const filters: Array<(row: SaleDocumentColumns) => boolean> = []
    const read = { order: [] as string[], range: null as [number, number] | null }
    const sorts: Array<{ column: keyof SaleDocumentColumns; ascending: boolean }> = []
    const matching = () =>
      rows
        .filter((row) => filters.every((f) => f(row)))
        .sort((a, b) => {
          for (const { column, ascending } of sorts) {
            const [x, y] = [String(a[column]), String(b[column])]
            if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1)
          }
          return 0
        })
    const query = {
      eq: (column: keyof SaleDocumentColumns, value: unknown) => {
        filters.push((row) => row[column] === value)
        return query
      },
      is: (column: keyof SaleDocumentColumns, value: unknown) => {
        filters.push((row) => row[column] === value)
        return query
      },
      lt: (column: keyof SaleDocumentColumns, value: string) => {
        filters.push((row) => String(row[column]) < value)
        return query
      },
      gte: (column: keyof SaleDocumentColumns, value: string) => {
        filters.push((row) => String(row[column]) >= value)
        return query
      },
      order: (column: keyof SaleDocumentColumns, options?: { ascending?: boolean }) => {
        read.order.push(column)
        sorts.push({ column, ascending: options?.ascending ?? true })
        return query
      },
      range: (from: number, to: number) => {
        read.range = [from, to]
        reads.push(read)
        return Promise.resolve({ data: matching().slice(from, to + 1), error: null })
      },
      maybeSingle: () =>
        Promise.resolve({
          data: rows.find((row) => filters.every((f) => f(row))) ?? null,
          error: null,
        }),
    }
    return query
  }

  const admin = {
    rpc: (_name: string, args: { p: Record<string, unknown> }) => {
      rpc.push(args.p)
      return Promise.resolve({
        data: { id: 'doc_new', number: 1_000_000_009, ...args.p },
        error: null,
      })
    },
    from: () => ({
      select,
      update: (values: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => {
          updates.push({ values, id })
          const failing = failures.updateFailsOn && failures.updateFailsOn in values
          if (!failing) Object.assign(rows.find((row) => row.id === id) ?? {}, values)
          return Promise.resolve({ error: failing ? { message: 'connection reset' } : null })
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: (path: string, bytes: Buffer) => {
          if (!failures.uploadError) bucket.set(path, bytes)
          return Promise.resolve({
            error: failures.uploadError ? { message: failures.uploadError } : null,
          })
        },
        download: (path: string) => {
          const bytes = bucket.get(path)
          return Promise.resolve(
            bytes
              ? { data: new Blob([new Uint8Array(bytes)]), error: null }
              : { data: null, error: { message: 'not found' } }
          )
        },
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({
            data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
            error: null,
          }),
      }),
    },
  }
  return { admin: admin as unknown as AdminClient, rpc, updates, bucket, reads }
}

const TAX_20 = {
  amount: 380,
  taxability_reason: 'standard_rated',
  tax_rate_details: { tax_rate: 'txr_bg' },
} as unknown as Stripe.Invoice.TotalTax

/** A paid invoice as the issuer reads it. WHY as: the SDK type carries a hundred fields; the issuer reads a dozen. */
function invoice(overrides: Record<string, unknown> = {}): Stripe.Invoice {
  return {
    id: 'in_1',
    currency: 'eur',
    amount_paid: 2280,
    total: 2280,
    subtotal: 1900,
    total_excluding_tax: 1900,
    starting_balance: 0,
    pre_payment_credit_notes_amount: 0,
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
          description: '1 × Kontuur (at €29.00 / month)',
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
  issued_at: '2025-10-01T01:00:05.000Z',
  tax_event_at: '2025-10-01T01:00:00.000Z',
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

  it('refuses the cases it cannot name — a reduced rate (none is sold), VAT due and not charged, a rate from outside the EU', () => {
    expect(() => vatBasisOf(tax('reduced_rated'), rate('BG'), 'BG')).toThrow(/reduced_rated/)
    expect(() => vatBasisOf(tax('not_collecting'), null, 'DE')).toThrow(/VAT was due/)
    expect(() => vatBasisOf(tax('standard_rated'), rate('US'), 'US')).toThrow(/tax rate country US/)
    expect(() => vatBasisOf(tax('customer_exempt'), null, 'BG')).toThrow(/customer_exempt/)
  })
})

describe('chargedMoney', () => {
  it('is a sale only when the card paid something', () => {
    expect(chargedMoney({ amount_paid: 2280 })).toBe(true)
    expect(chargedMoney({ amount_paid: 0 })).toBe(false)
  })
})

describe('issueSaleDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invoicesRetrieve.mockResolvedValue(invoice())
    mocks.taxRatesRetrieve.mockResolvedValue({ id: 'txr_bg', country: 'BG', percentage: 20 })
  })

  it('snapshots payer, lines, totals, basis, charge and tax point (the payment’s date); the RPC dates the document', async () => {
    const { admin, rpc } = makeAdmin()
    const document = await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })

    expect(mocks.invoicesRetrieve).toHaveBeenCalledWith('in_1', {
      expand: ['payments.data.payment.payment_intent'],
    })
    expect(document?.number).toBe(1_000_000_009)
    expect(rpc[0]).toMatchObject({
      kind: 'invoice',
      agency_id: 'a1',
      stripe_invoice_id: 'in_1',
      stripe_charge_id: 'ch_1',
      tax_event_at: '2025-10-01T01:00:00.000Z',
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
          description: '1 × Kontuur (at €29.00 / month)',
          quantity: 1,
          unitCents: 1900,
          netCents: 1900,
          periodStart: '2025-10-01T00:00:00.000Z',
          periodEnd: '2025-10-31T00:00:00.000Z',
        },
      ],
    })
    expect(rpc[0]).not.toHaveProperty('issued_at')
  })

  it('a payment with no workspace left to own it still becomes a document, from the snapshot alone', async () => {
    const { admin, rpc } = makeAdmin()
    await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: null })
    expect(rpc[0]).toMatchObject({ kind: 'invoice', agency_id: null, stripe_invoice_id: 'in_1' })
  })

  it('keeps a fractional OSS rate exactly as Stripe charged it', async () => {
    mocks.taxRatesRetrieve.mockResolvedValue({ id: 'txr_fi', country: 'FI', percentage: 25.5 })
    mocks.invoicesRetrieve.mockResolvedValue(
      invoice({
        total: 2385,
        amount_paid: 2385,
        customer_address: { country: 'FI' },
        total_taxes: [
          {
            amount: 485,
            taxability_reason: 'standard_rated',
            tax_rate_details: { tax_rate: 'txr_fi' },
          },
        ],
      })
    )
    const { admin, rpc } = makeAdmin()
    await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })
    expect(rpc[0]).toMatchObject({ vat_basis: 'oss', vat_rate: 25.5 })
  })

  it('a German company on reverse charge, and a Skopje company outside the EU', async () => {
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

    mocks.invoicesRetrieve.mockResolvedValue(
      invoice({
        total: 1900,
        amount_paid: 1900,
        customer_address: { country: 'MK' },
        total_taxes: [{ amount: 0, taxability_reason: 'not_collecting', tax_rate_details: null }],
      })
    )
    await issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })
    expect(rpc[1]).toMatchObject({ vat_basis: 'outside_eu' })
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

  it.each([
    ['a credit that paid part', { starting_balance: -500, amount_paid: 1780 }, /customer credit/],
    ['a credit that paid it all', { starting_balance: -2280, amount_paid: 0 }, /customer credit/],
    ['a carried debt', { starting_balance: 300, amount_paid: 2580 }, /debt from an earlier/],
    [
      'a pre-payment credit note',
      { pre_payment_credit_notes_amount: 2280, amount_paid: 0 },
      /pre-payment credit note/,
    ],
  ])(
    'refuses an invoice with %s by name — the audit file has no line for money held on account',
    async (_label, overrides, reason) => {
      mocks.invoicesRetrieve.mockResolvedValue(invoice(overrides))
      const { admin, rpc } = makeAdmin()
      await expect(issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })).rejects.toThrow(
        reason
      )
      expect(rpc).toEqual([])
    }
  )

  it('refuses a part payment with no balance on it, naming both amounts', async () => {
    mocks.invoicesRetrieve.mockResolvedValue(invoice({ amount_paid: 1000 }))
    await expect(
      issueSaleDocument(makeAdmin().admin, { invoiceId: 'in_1', agencyId: 'a1' })
    ).rejects.toThrow(/paid 1000 of its total 2280/)
  })

  it('refuses an invoice paid with no card charge, issuing no number', async () => {
    mocks.invoicesRetrieve.mockResolvedValue(invoice({ payments: { data: [] } }))
    const { admin, rpc } = makeAdmin()
    await expect(issueSaleDocument(admin, { invoiceId: 'in_1', agencyId: 'a1' })).rejects.toThrow(
      'invoice in_1 was paid with no card charge; its document names one'
    )
    expect(rpc).toEqual([])
  })
})

/** A credit note as the issuer reads it. WHY as: the SDK type carries forty fields; the issuer reads ten. */
const note = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'cn_1',
    type: 'post_payment',
    currency: 'eur',
    invoice: 'in_1',
    created: 1_760_000_000,
    subtotal: 950,
    total_excluding_tax: 950,
    total: 1140,
    total_taxes: [{ amount: 190 }],
    refunds: [{ refund: 're_1', amount_refunded: 1140 }],
    out_of_band_amount: null,
    customer_balance_transaction: null,
    ...overrides,
  }) as unknown as Stripe.CreditNote

describe('issueCreditNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refunds the invoice document by its number and date, keeping its customer, basis and rate, dated by the note', async () => {
    mocks.creditNotesRetrieve.mockResolvedValue(note())
    const { admin, rpc } = makeAdmin([DOCUMENT])
    const document = await issueCreditNote(admin, 'cn_1')
    expect(document?.kind).toBe('credit_note')
    expect(rpc[0]).toMatchObject({
      kind: 'credit_note',
      agency_id: 'a1',
      stripe_invoice_id: 'in_1',
      stripe_credit_note_id: 'cn_1',
      stripe_charge_id: 'ch_1',
      stripe_refund_id: 're_1',
      tax_event_at: '2025-10-09T08:53:20.000Z',
      customer: DOCUMENT.customer,
      net_cents: 950,
      vat_cents: 190,
      gross_cents: 1140,
      vat_rate: 20,
      vat_basis: 'domestic',
      lines: [
        expect.objectContaining({
          description: 'Credit note to invoice No. 1000000001 of 1 October 2025',
          netCents: 950,
        }),
      ],
    })
  })

  it('states the net after an invoice-level discount, as the invoice it refunds does', async () => {
    mocks.creditNotesRetrieve.mockResolvedValue(
      note({
        subtotal: 2900,
        total_excluding_tax: 1450,
        total: 1740,
        total_taxes: [{ amount: 290 }],
        refunds: [{ refund: 're_1', amount_refunded: 1740 }],
      })
    )
    const { admin, rpc } = makeAdmin([DOCUMENT])
    await issueCreditNote(admin, 'cn_1')
    expect(rpc[0]).toMatchObject({ net_cents: 1450, vat_cents: 290, gross_cents: 1740 })
  })

  it('documents a chargeback the bank won — the whole total out of band — on the original charge, with no refund', async () => {
    mocks.creditNotesRetrieve.mockResolvedValue(note({ refunds: [], out_of_band_amount: 1140 }))
    const { admin, rpc } = makeAdmin([DOCUMENT])
    await issueCreditNote(admin, 'cn_1')
    expect(rpc[0]).toMatchObject({ stripe_refund_id: null, stripe_charge_id: 'ch_1' })
  })

  it.each([
    ['a credit to the balance', { refunds: [], customer_balance_transaction: 'cbtxn_1' }],
    [
      'a refund and an out-of-band part',
      { out_of_band_amount: 140, refunds: [{ refund: 're_1', amount_refunded: 1000 }] },
    ],
    [
      'two refunds',
      {
        refunds: [
          { refund: 're_1', amount_refunded: 570 },
          { refund: 're_2', amount_refunded: 570 },
        ],
      },
    ],
    ['a part refund', { refunds: [{ refund: 're_1', amount_refunded: 500 }] }],
  ])('refuses %s — not a return the audit file can report as one', async (_label, overrides) => {
    mocks.creditNotesRetrieve.mockResolvedValue(note(overrides))
    const { admin, rpc } = makeAdmin([DOCUMENT])
    await expect(issueCreditNote(admin, 'cn_1')).rejects.toThrow(/credit note cn_1/)
    expect(rpc).toEqual([])
  })

  it('issues nothing for a pre-payment note — no money moved', async () => {
    mocks.creditNotesRetrieve.mockResolvedValue(note({ type: 'pre_payment' }))
    const { admin, rpc } = makeAdmin([DOCUMENT])
    expect(await issueCreditNote(admin, 'cn_1')).toBeNull()
    expect(rpc).toEqual([])
  })

  it('refuses to credit an invoice it never documented', async () => {
    mocks.creditNotesRetrieve.mockResolvedValue(note())
    await expect(issueCreditNote(makeAdmin([]).admin, 'cn_1')).rejects.toThrow(/has no document/)
  })
})

describe('deliverSaleDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.renderSaleDocumentHtml.mockResolvedValue('<html>')
    mocks.renderPdf.mockResolvedValue(Buffer.from('%PDF-first'))
    mocks.sendEmail.mockResolvedValue(undefined)
  })

  it('prints and keeps the PDF, records where before sending, mails once with the key, then stamps', async () => {
    const { admin, updates, bucket } = makeAdmin([{ ...DOCUMENT }])
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('delivered')
    expect([...bucket.keys()]).toEqual(['a1/1000000001.pdf'])
    expect(updates[0]).toEqual({ id: 'doc_1', values: { storage_path: 'a1/1000000001.pdf' } })
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@acme.bg',
        attachments: [{ filename: 'kontuur-1000000001.pdf', content: Buffer.from('%PDF-first') }],
        idempotencyKey: 'document:doc_1',
      })
    )
    expect(updates[1]?.values).toMatchObject({ delivery_error: null })
    expect(typeof updates[1]?.values.delivered_at).toBe('string')
  })

  it('resends the very bytes it stored, under the same key and never a fresh render, after a stamp that did not land', async () => {
    const row = { ...DOCUMENT }
    const first = makeAdmin([row], { updateFailsOn: 'delivered_at' })
    expect(await deliverSaleDocument(first.admin, 'doc_1')).toBe('failed')
    expect(row.storage_path).toBe('a1/1000000001.pdf')

    mocks.renderPdf.mockResolvedValue(Buffer.from('%PDF-second'))
    const second = makeAdmin([row])
    const stored = first.bucket.get('a1/1000000001.pdf')
    expect(stored).toBeDefined()
    second.bucket.set('a1/1000000001.pdf', stored!)
    expect(await deliverSaleDocument(second.admin, 'doc_1')).toBe('delivered')
    expect(mocks.renderPdf).toHaveBeenCalledTimes(1)
    const sent = mocks.sendEmail.mock.calls.map((call) => call[0])
    expect(sent.map((email) => email.idempotencyKey)).toEqual(['document:doc_1', 'document:doc_1'])
    expect(sent.map((email) => email.attachments[0].content.toString())).toEqual([
      '%PDF-first',
      '%PDF-first',
    ])
  })

  it('sends nothing when where the PDF is kept cannot be recorded', async () => {
    const { admin } = makeAdmin([{ ...DOCUMENT }], { updateFailsOn: 'storage_path' })
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('failed')
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('records a failure on the row and reports it, never throwing', async () => {
    const { admin, updates } = makeAdmin([{ ...DOCUMENT }], { uploadError: 'bucket missing' })
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('failed')
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(updates).toEqual([
      { id: 'doc_1', values: { delivery_error: 'document upload failed: bucket missing' } },
    ])
  })

  it('fails before printing anything when the payer has no email', async () => {
    const { admin } = makeAdmin([
      { ...DOCUMENT, customer: { name: 'Acme', email: null, address: null, taxIds: [] } },
    ])
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('failed')
    expect(mocks.renderPdf).not.toHaveBeenCalled()
  })

  it('mails a deleted workspace’s document without pointing at a Plan & billing it no longer has', async () => {
    const { admin } = makeAdmin([{ ...DOCUMENT, agency_id: null }])
    await deliverSaleDocument(admin, 'doc_1')
    expect(mocks.sendEmail.mock.calls[0]?.[0].content).not.toHaveProperty('cta')
  })

  it('never re-sends a document that was delivered', async () => {
    const { admin, bucket } = makeAdmin([{ ...DOCUMENT, delivered_at: '2025-10-01T01:01:00.000Z' }])
    expect(await deliverSaleDocument(admin, 'doc_1')).toBe('delivered')
    expect(bucket.size).toBe(0)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})

describe('fetchSaleDocumentsBetween', () => {
  it('reads a month past the row cap whole, in number order', async () => {
    const month = Array.from({ length: 1001 }, (_, i) => ({
      ...DOCUMENT,
      id: `doc_${i}`,
      number: 1_000_000_000 + i,
    }))
    const { admin, reads } = makeAdmin(month)
    const documents = await fetchSaleDocumentsBetween(
      admin,
      '2025-10-01T00:00:00.000Z',
      '2025-11-01T00:00:00.000Z'
    )
    expect(documents).toHaveLength(1001)
    expect(documents.at(-1)?.number).toBe(1_000_001_000)
    expect(reads.map((read) => read.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

describe('retryUndeliveredDocuments and listDocumentDownloads', () => {
  const LATER = Date.now() + 60_000

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.renderSaleDocumentHtml.mockResolvedValue('<html>')
    mocks.renderPdf.mockResolvedValue(Buffer.from('%PDF'))
    mocks.sendEmail.mockResolvedValue(undefined)
  })

  function stale(id: string, day: number, email: string | null = 'billing@acme.bg') {
    return {
      ...DOCUMENT,
      id,
      issued_at: `2025-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
      customer: { name: 'Acme OOD', email, address: null, taxIds: [] },
    }
  }

  it('takes every stale undelivered document through delivery, oldest first', async () => {
    const { admin, reads } = makeAdmin([stale('doc_new', 3), stale('doc_old', 1)])
    expect(await retryUndeliveredDocuments(admin, LATER)).toEqual({ retried: 2, delivered: 2 })
    expect(reads[0]).toEqual({ order: ['issued_at', 'id'], range: [0, 999] })
    expect(mocks.sendEmail.mock.calls.map(([email]) => email.idempotencyKey)).toEqual([
      'document:doc_old',
      'document:doc_new',
    ])
  })

  it('never lets documents that fail fast starve the one behind them', async () => {
    const unmailable = Array.from({ length: 12 }, (_, i) => stale(`doc_${i}`, 1, null))
    const { admin } = makeAdmin([...unmailable, stale('doc_late', 20)])
    expect(await retryUndeliveredDocuments(admin, LATER)).toEqual({ retried: 13, delivered: 1 })
    expect(mocks.renderPdf).toHaveBeenCalledTimes(1)
  })

  it('reads every page of them before the first send', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => stale(`doc_${i}`, 1, null))
    const { admin, reads } = makeAdmin(many)
    expect(await retryUndeliveredDocuments(admin, LATER)).toEqual({ retried: 1001, delivered: 0 })
    expect(reads.map((read) => read.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('starts no delivery past the deadline, leaving the rest for the next day', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-26T08:00:00Z'), toFake: ['Date'] })
    const deadline = Date.now() + 1_000
    mocks.sendEmail.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 5_000)
    })
    const { admin } = makeAdmin([stale('doc_1', 1), stale('doc_2', 2)])
    expect(await retryUndeliveredDocuments(admin, deadline)).toEqual({ retried: 1, delivered: 1 })
    vi.useRealTimers()
  })

  it('gives each stored document a signed link and the unstored ones none, in one call', async () => {
    const stored = { ...DOCUMENT, storage_path: 'a1/1000000001.pdf' }
    const listed = await listDocumentDownloads(makeAdmin().admin, [
      stored,
      { ...DOCUMENT, id: 'doc_2' },
    ])
    expect(listed.map((document) => document.url)).toEqual([
      'https://signed/a1/1000000001.pdf',
      null,
    ])
  })
})
