import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ fetchSaleDocumentsBetween: vi.fn() }))
vi.mock('@/lib/queries/db', () => ({
  fetchSaleDocumentsBetween: mocks.fetchSaleDocumentsBetween,
}))

import { GET } from '../audit-file/route'

function request(month: string | null, bearer = 'Bearer s3cret'): NextRequest {
  const url = new URL('https://kontuur.app/api/billing/audit-file')
  if (month !== null) url.searchParams.set('month', month)
  return new NextRequest(url, { headers: bearer ? { authorization: bearer } : {} })
}

describe('GET /api/billing/audit-file', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    vi.stubEnv('NRA_ESHOP_NUMBER', 'RF0000123')
    vi.stubEnv('STRIPE_ACCOUNT_ID', 'acct_1')
    mocks.fetchSaleDocumentsBetween.mockReset().mockResolvedValue([])
  })
  afterEach(() => vi.unstubAllEnvs())

  it('is behind the cron bearer and takes only a real month', async () => {
    expect((await GET(request('2026-10', ''))).status).toBe(401)
    expect((await GET(request('October'))).status).toBe(400)
    expect((await GET(request(null))).status).toBe(400)
    expect(mocks.fetchSaleDocumentsBetween).not.toHaveBeenCalled()
  })

  it('answers 204 for a month with nothing sold', async () => {
    const response = await GET(request('2026-10'))
    expect(response.status).toBe(204)
    expect(mocks.fetchSaleDocumentsBetween).toHaveBeenCalledWith(
      '2026-09-30T00:00:00.000Z',
      '2026-11-02T00:00:00.000Z'
    )
  })

  it('hands back the month’s file as an XML attachment', async () => {
    mocks.fetchSaleDocumentsBetween.mockResolvedValue([
      {
        id: 'doc_1',
        number: 1_000_000_001,
        kind: 'invoice',
        agency_id: 'a1',
        stripe_invoice_id: 'in_1',
        stripe_credit_note_id: null,
        stripe_charge_id: 'ch_1',
        stripe_refund_id: null,
        refunds: null,
        issued_at: '2026-10-03T10:00:00.000Z',
        customer: { name: 'A', email: null, address: null, taxIds: [] },
        lines: [
          {
            description: 'Kontuur',
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
        vat_rate: 20,
        vat_basis: 'domestic',
        storage_path: null,
        delivered_at: null,
        delivery_error: null,
        created_at: '2026-10-03T10:00:05.000Z',
      },
    ])
    const response = await GET(request('2026-10'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/xml; charset=windows-1251')
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="audit-2026-10.xml"'
    )
    const xml = await response.text()
    expect(xml).toContain('<doc_n>1000000001</doc_n>')
    expect(xml).toContain('<pos_n>acct_1</pos_n>')
  })
})
