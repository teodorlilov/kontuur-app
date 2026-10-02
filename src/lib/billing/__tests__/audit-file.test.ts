import { describe, expect, it } from 'vitest'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { AuditFileError, auditMonthSchema, buildAuditFile } from '../audit-file'

const IDS = { eShopNumber: 'RF0000123', stripeAccountId: 'acct_1Kontuur' }

function document(overrides: Partial<SaleDocumentColumns>): SaleDocumentColumns {
  return {
    id: 'doc_1',
    number: 1_000_000_001,
    kind: 'invoice',
    agency_id: 'a1',
    stripe_invoice_id: 'in_1ABC',
    stripe_credit_note_id: null,
    stripe_charge_id: 'ch_1XYZ',
    stripe_refund_id: null,
    issued_at: '2026-10-03T10:00:00.000Z',
    tax_event_at: '2026-10-03T09:59:55.000Z',
    customer: { name: 'Acme OOD', email: 'a@acme.bg', address: null, taxIds: [] },
    lines: [
      {
        description: '3 × Kontuur (at €19.00 / month)',
        quantity: 3,
        unitCents: 1900,
        netCents: 5700,
        periodStart: null,
        periodEnd: null,
      },
    ],
    net_cents: 5700,
    vat_cents: 1140,
    gross_cents: 6840,
    vat_rate: 20,
    vat_basis: 'domestic',
    storage_path: null,
    delivered_at: null,
    delivery_error: null,
    ...overrides,
  }
}

const REVERSE_CHARGE = document({
  id: 'doc_2',
  number: 1_000_000_002,
  stripe_invoice_id: 'in_2DEF',
  stripe_charge_id: 'ch_2DEF',
  issued_at: '2026-10-12T08:00:00.000Z',
  tax_event_at: '2026-10-12T07:59:58.000Z',
  lines: [
    {
      description: '1 × Kontuur (at €19.00 / month)',
      quantity: 1,
      unitCents: 1900,
      netCents: 1900,
      periodStart: null,
      periodEnd: null,
    },
  ],
  net_cents: 1900,
  vat_cents: 0,
  gross_cents: 1900,
  vat_rate: 0,
  vat_basis: 'reverse_charge',
})

const CREDIT_NOTE = document({
  id: 'doc_3',
  number: 1_000_000_003,
  kind: 'credit_note',
  stripe_credit_note_id: 'cn_1',
  stripe_refund_id: 're_1',
  issued_at: '2026-10-20T15:00:00.000Z',
  tax_event_at: '2026-10-20T14:59:59.000Z',
  lines: [
    {
      description: 'Credit note to invoice No. 1000000001',
      quantity: 1,
      unitCents: 1900,
      netCents: 1900,
      periodStart: null,
      periodEnd: null,
    },
  ],
  net_cents: 1900,
  vat_cents: 380,
  gross_cents: 2280,
})

const CREATED_ON = new Date('2026-11-03T09:00:00Z')

describe('buildAuditFile — Приложение 38', () => {
  it('renders the month to its snapshot: the shop header, one order per invoice, one refund per credit note', async () => {
    const xml = buildAuditFile(
      {
        month: '2026-10',
        documents: [document({}), REVERSE_CHARGE, CREDIT_NOTE],
        createdOn: CREATED_ON,
      },
      IDS
    )
    await expect(xml).toMatchFileSnapshot('./__snapshots__/audit-2026-10.xml')
  })

  it('says what the NRA file needs to say about each order and each refund', () => {
    const xml = buildAuditFile(
      {
        month: '2026-10',
        documents: [document({}), CREDIT_NOTE],
        createdOn: CREATED_ON,
      },
      IDS
    )!
    for (const fragment of [
      '<eik>206770508</eik>',
      '<e_shop_n>RF0000123</e_shop_n>',
      '<mon>10</mon><god>2026</god>',
      '<ord_n>in_1ABC</ord_n><ord_d>2026-10-03</ord_d><doc_n>1000000001</doc_n>',
      '<art_name>3 x Kontuur (at EUR19.00 / month)</art_name>',
      '<art_vat_rate>20</art_vat_rate><art_vat>11.40</art_vat><art_sum>68.40</art_sum>',
      '<ord_total1>57.00</ord_total1><ord_disc>0.00</ord_disc><ord_vat>11.40</ord_vat><ord_total2>68.40</ord_total2>',
      '<paym>2</paym><pos_n>acct_1Kontuur</pos_n><trans_n>ch_1XYZ</trans_n><proc_id>Stripe Technology Europe Limited</proc_id>',
      '<r_ord>1</r_ord>',
      '<r_ord_n>in_1ABC</r_ord_n><r_amount>22.80</r_amount><r_date>2026-10-20</r_date><r_paym>2</r_paym>',
      '<r_total>22.80</r_total>',
    ]) {
      expect(xml, fragment).toContain(fragment)
    }
    expect(xml.startsWith('<?xml version="1.0" encoding="windows-1251"?>')).toBe(true)
    expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(xml)).toBe(false)
  })

  it('splits the VAT over the lines so it sums exactly, and refuses a document whose lines do not add up', () => {
    const twoLines = document({
      lines: [
        {
          description: 'A',
          quantity: 1,
          unitCents: 1000,
          netCents: 1000,
          periodStart: null,
          periodEnd: null,
        },
        {
          description: 'B',
          quantity: 1,
          unitCents: 1000,
          netCents: 1000,
          periodStart: null,
          periodEnd: null,
        },
      ],
      net_cents: 2000,
      vat_cents: 401,
      gross_cents: 2401,
    })
    const xml = buildAuditFile(
      {
        month: '2026-10',
        documents: [twoLines],
        createdOn: CREATED_ON,
      },
      IDS
    )!
    expect(xml).toContain('<art_vat>2.00</art_vat>')
    expect(xml).toContain('<art_vat>2.01</art_vat>')
    expect(() =>
      buildAuditFile(
        {
          month: '2026-10',
          documents: [document({ gross_cents: 6900 })],
          createdOn: CREATED_ON,
        },
        IDS
      )
    ).toThrow(/lines total 6840 but the document says 6900/)
  })

  it('dates the order and the refund by the tax point and the document by its issue, a day apart across Sofia midnight', () => {
    const paidLate = document({
      issued_at: '2026-10-03T21:00:10.000Z',
      tax_event_at: '2026-10-03T20:59:50.000Z',
    })
    const refundedLate = { ...CREDIT_NOTE, tax_event_at: '2026-10-19T21:30:00.000Z' }
    const xml = buildAuditFile(
      {
        month: '2026-10',
        documents: [paidLate, refundedLate],
        createdOn: CREATED_ON,
      },
      IDS
    )!
    expect(xml).toContain(
      '<ord_d>2026-10-03</ord_d><doc_n>1000000001</doc_n><doc_date>2026-10-04</doc_date>'
    )
    expect(xml).toContain('<r_date>2026-10-20</r_date>')
  })

  it('refuses a fractional VAT rate by document rather than round it into a false line — the schema takes whole percentages', () => {
    expect(() =>
      buildAuditFile(
        {
          month: '2026-10',
          documents: [document({ vat_rate: 25.5 })],
          createdOn: CREATED_ON,
        },
        IDS
      )
    ).toThrow(
      new AuditFileError(
        'Document 1000000001 carries VAT at 25.5 %, but the audit file takes whole percentages only. Ask the accountant how to report it.'
      )
    )
  })

  it('refuses a month of refunds and no sale — the schema requires an order', () => {
    expect(() =>
      buildAuditFile(
        {
          month: '2026-10',
          documents: [CREDIT_NOTE],
          createdOn: CREATED_ON,
        },
        IDS
      )
    ).toThrow(AuditFileError)
  })

  it('counts the orders returned, not the notes — two notes against one invoice are one returned order', () => {
    const second = {
      ...CREDIT_NOTE,
      id: 'doc_4',
      number: 1_000_000_004,
      stripe_credit_note_id: 'cn_2',
    }
    const xml = buildAuditFile(
      {
        month: '2026-10',
        documents: [document({}), CREDIT_NOTE, second],
        createdOn: CREATED_ON,
      },
      IDS
    )!
    expect(xml).toContain('<r_ord>1</r_ord>')
  })

  it('is nothing for a month with no document', () => {
    expect(
      buildAuditFile({ month: '2026-10', documents: [], createdOn: CREATED_ON }, IDS)
    ).toBeNull()
  })
})

describe('the month', () => {
  it('accepts YYYY-MM and nothing else', () => {
    expect(auditMonthSchema.safeParse('2026-10').success).toBe(true)
    expect(auditMonthSchema.safeParse('2026-13').success).toBe(false)
    expect(auditMonthSchema.safeParse('10-2026').success).toBe(false)
  })
})
