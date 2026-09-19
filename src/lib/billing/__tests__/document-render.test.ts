import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { documentIds, qrPayload, renderSaleDocumentHtml, TAX_GROUPS } from '../document-render'

const IDS = { eShopNumber: 'RF0000123', stripeAccountId: 'acct_1Kontuur' }

const INVOICE: SaleDocumentColumns = {
  id: 'doc_1',
  number: 1_000_000_001,
  kind: 'invoice',
  agency_id: 'a1',
  stripe_invoice_id: 'in_1ABC',
  stripe_credit_note_id: null,
  stripe_charge_id: 'ch_1XYZ',
  stripe_refund_id: null,
  refunds: null,
  // 21:30:05 in Sofia on 1 October (UTC+3).
  issued_at: '2025-10-01T18:30:05.000Z',
  customer: {
    name: 'Acme OOD',
    email: 'billing@acme.bg',
    address: {
      line1: 'bul. Vitosha 1',
      line2: null,
      city: 'Sofia',
      postal_code: '1000',
      state: null,
      country: 'BG',
    },
    taxIds: [{ type: 'eu_vat', value: 'BG123456789' }],
  },
  lines: [
    {
      description: '3 × Kontuur (at €19.00 / month)',
      quantity: 3,
      unitCents: 1900,
      netCents: 5700,
      periodStart: '2025-10-01T00:00:00.000Z',
      periodEnd: '2025-10-31T00:00:00.000Z',
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
  created_at: '2025-10-01T18:30:10.000Z',
}

const CREDIT_NOTE: SaleDocumentColumns = {
  ...INVOICE,
  id: 'doc_2',
  number: 1_000_000_002,
  kind: 'credit_note',
  stripe_credit_note_id: 'cn_1DEF',
  stripe_refund_id: 're_1GHI',
  refunds: 'doc_1',
  issued_at: '2025-10-05T07:00:00.000Z',
  customer: {
    name: 'Hans Müller',
    email: 'hans@example.de',
    address: {
      line1: 'Hauptstr. 1',
      line2: null,
      city: 'Berlin',
      postal_code: '10115',
      state: null,
      country: 'DE',
    },
    taxIds: [],
  },
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
  vat_cents: 361,
  gross_cents: 2261,
  vat_rate: 19,
  vat_basis: 'oss',
}

describe('qrPayload — Приложение 18а', () => {
  it('is the shop number, order, transaction, Sofia date and time, and the total, joined by *', () => {
    expect(qrPayload(INVOICE, IDS.eShopNumber)).toBe(
      'RF0000123*in_1ABC*ch_1XYZ*2025-10-01*21:30:05*68.40'
    )
  })

  it('names the credit note and its refund for a refund', () => {
    expect(qrPayload(CREDIT_NOTE, IDS.eShopNumber)).toBe(
      'RF0000123*cn_1DEF*re_1GHI*2025-10-05*10:00:00*22.61'
    )
  })
})

describe('documentIds', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('refuses to render without the shop number or the account id', () => {
    vi.stubEnv('NRA_ESHOP_NUMBER', '')
    vi.stubEnv('STRIPE_ACCOUNT_ID', 'acct_1')
    expect(() => documentIds()).toThrow(/NRA_ESHOP_NUMBER/)
    vi.stubEnv('NRA_ESHOP_NUMBER', 'RF1')
    vi.stubEnv('STRIPE_ACCOUNT_ID', '')
    expect(() => documentIds()).toThrow(/STRIPE_ACCOUNT_ID/)
  })
})

describe('renderSaleDocumentHtml', () => {
  beforeEach(() => vi.unstubAllEnvs())

  it('carries every item чл. 52о asks for, in English, and prints the amounts in euro', async () => {
    const html = await renderSaleDocumentHtml(INVOICE, IDS)
    for (const text of [
      '>Invoice<',
      'No. 1000000001',
      'Chelling Ltd',
      '27 Gabar St, 1320 Bankya, Bulgaria',
      'Reg. no. (UIC): 206770508',
      'VAT: BG206770508',
      'NRA no. RF0000123',
      'Acme OOD',
      'VAT: BG123456789',
      'in_1ABC',
      'ch_1XYZ',
      'Virtual POS: acct_1Kontuur',
      'Card payment, Stripe',
      '3 × Kontuur (at €19.00 / month)',
      '€57.00',
      'VAT 20 %',
      '€11.40',
      '€68.40',
      'RF0000123*in_1ABC*ch_1XYZ*2025-10-01*21:30:05*68.40',
      '<svg',
      'Art. 52o of Regulation N-18',
    ]) {
      expect(html, text).toContain(text)
    }
    expect(html).toContain(`>${TAX_GROUPS.domestic}<`)
  })

  it('carries no Bulgarian text — only the regulation’s own tax-group letters', async () => {
    const html = await renderSaleDocumentHtml(INVOICE, IDS)
    const cyrillic = html.match(/[\u0400-\u04ff]+/g) ?? []
    expect(new Set(cyrillic)).toEqual(new Set([TAX_GROUPS.domestic]))
  })

  it('renders the invoice and the credit note to their snapshots', async () => {
    await expect(await renderSaleDocumentHtml(INVOICE, IDS)).toMatchFileSnapshot(
      './__snapshots__/document-invoice.html'
    )
    await expect(await renderSaleDocumentHtml(CREDIT_NOTE, IDS)).toMatchFileSnapshot(
      './__snapshots__/document-credit-note.html'
    )
  })

  it('escapes what the customer typed, so a name cannot close the page', async () => {
    const html = await renderSaleDocumentHtml(
      {
        ...INVOICE,
        customer: { ...(INVOICE.customer as object), name: '</td><script>x</script>' } as never,
      },
      IDS
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
