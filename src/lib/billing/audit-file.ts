import { z } from 'zod'
import { escapeHtml } from '@/lib/email/layout'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { toDateKey } from '@/utils/date-helpers'
import { parseDocumentLines } from './document-schemas'

/** The zone the NRA's calendar month is counted in — the documents' own. */
const AUDIT_TIMEZONE = 'Europe/Sofia'

/** Приложение 38's payment codes: a card charge through a virtual POS is 2, a refund back to the card is 2 as well. */
const PAYMENT_VIRTUAL_POS = 2
const REFUND_TO_CARD = 2

/** The payment service provider named on every order, as `proc_id`. */
const PROCESSOR = 'Stripe Technology Europe Limited'

/** `?month=YYYY-MM`, the only input the download route takes. */
export const auditMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM')

interface AuditSeller {
  eik: string
  eShopNumber: string
  domain: string
  stripeAccountId: string
}

/**
 * The half-open UTC range that surely contains every instant of a Sofia calendar month — a day
 * of slack on each side, so the read is one query and `documentsOfMonth` does the exact cut.
 */
export function monthReadRange(month: string): { fromIso: string; toIso: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const day = 86_400_000
  return {
    fromIso: new Date(Date.UTC(year, monthNumber - 1, 1) - day).toISOString(),
    toIso: new Date(Date.UTC(year, monthNumber, 1) + day).toISOString(),
  }
}

/** The documents whose Sofia date falls in `month`. */
export function documentsOfMonth(
  documents: SaleDocumentColumns[],
  month: string
): SaleDocumentColumns[] {
  return documents.filter((document) =>
    toDateKey(new Date(document.issued_at), AUDIT_TIMEZONE).startsWith(month)
  )
}

function money(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * The file declares windows-1251 as the NRA's sample does, and its bytes are what a UTF-8 writer
 * produces, so the content is held to ASCII: the few non-ASCII characters Stripe puts in a line
 * description are folded, and anything left is a defect, not a silent mis-encoding.
 */
function ascii(value: string): string {
  return value
    .replace(/×/g, 'x')
    .replace(/€/g, 'EUR')
    .replace(/№/g, 'No')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function element(name: string, value: string | number): string {
  return `<${name}>${escapeHtml(String(value))}</${name}>`
}

/** Line VAT that sums exactly to the document's VAT: proportional, the remainder on the last line. */
function splitVat(vatCents: number, netCents: number[]): number[] {
  const totalNet = netCents.reduce((sum, net) => sum + net, 0)
  const shares = netCents.map((net) =>
    totalNet === 0 ? 0 : Math.round((vatCents * net) / totalNet)
  )
  const allocated = shares.reduce((sum, share) => sum + share, 0)
  if (shares.length > 0) shares[shares.length - 1]! += vatCents - allocated
  return shares
}

function orderOf(document: SaleDocumentColumns, seller: AuditSeller): string {
  const lines = parseDocumentLines(document.lines)
  const vatShares = splitVat(
    document.vat_cents,
    lines.map((line) => line.netCents)
  )
  const date = toDateKey(new Date(document.issued_at), AUDIT_TIMEZONE)
  const articles = lines.map((line, index) => {
    const vat = vatShares[index] ?? 0
    return (
      '<artenum>' +
      element('art_name', ascii(line.description) || 'Kontuur subscription') +
      element('art_quant', line.quantity) +
      element('art_price', money(line.unitCents)) +
      element('art_vat_rate', document.vat_rate) +
      element('art_vat', money(vat)) +
      element('art_sum', money(line.netCents + vat)) +
      '</artenum>'
    )
  })
  const articlesGross = lines.reduce(
    (sum, line, index) => sum + line.netCents + (vatShares[index] ?? 0),
    0
  )
  if (articlesGross !== document.gross_cents) {
    throw new Error(
      `document ${document.number}: lines total ${articlesGross} but the document says ${document.gross_cents}`
    )
  }
  return (
    '<orderenum>' +
    element('ord_n', document.stripe_invoice_id ?? '') +
    element('ord_d', date) +
    element('doc_n', document.number) +
    element('doc_date', date) +
    `<art>${articles.join('')}</art>` +
    element('ord_total1', money(document.net_cents)) +
    element('ord_disc', money(0)) +
    element('ord_vat', money(document.vat_cents)) +
    element('ord_total2', money(document.gross_cents)) +
    element('paym', PAYMENT_VIRTUAL_POS) +
    element('pos_n', seller.stripeAccountId) +
    element('trans_n', document.stripe_charge_id ?? '') +
    element('proc_id', PROCESSOR) +
    '</orderenum>'
  )
}

function refundOf(document: SaleDocumentColumns): string {
  return (
    '<rorderenum>' +
    element('r_ord_n', document.stripe_invoice_id ?? '') +
    element('r_amount', money(document.gross_cents)) +
    element('r_date', toDateKey(new Date(document.issued_at), AUDIT_TIMEZONE)) +
    element('r_paym', REFUND_TO_CARD) +
    '</rorderenum>'
  )
}

/**
 * One month's standardised audit file, as `docs/n18/dec_audit.xsd` describes it (Приложение 38):
 * the shop header, one order per invoice document with its lines, and one refund per credit
 * note. Amounts in euro with two decimals, summing exactly or throwing — a wrong file never
 * leaves the machine. Null when the month holds no document. Pure.
 */
export function buildAuditFile(input: {
  seller: AuditSeller
  month: string
  documents: SaleDocumentColumns[]
  createdOn: Date
}): string | null {
  const invoices = input.documents.filter((document) => document.kind === 'invoice')
  const creditNotes = input.documents.filter((document) => document.kind === 'credit_note')
  if (invoices.length === 0 && creditNotes.length === 0) return null

  const [year, month] = input.month.split('-') as [string, string]
  const refundTotal = creditNotes.reduce((sum, document) => sum + document.gross_cents, 0)
  const xml =
    '<?xml version="1.0" encoding="windows-1251"?>' +
    '<audit>' +
    element('eik', input.seller.eik) +
    element('e_shop_n', input.seller.eShopNumber) +
    element('domain_name', input.seller.domain) +
    element('e_shop_type', 1) +
    element('creation_date', toDateKey(input.createdOn, AUDIT_TIMEZONE)) +
    element('mon', month) +
    element('god', year) +
    `<order>${invoices.map((document) => orderOf(document, input.seller)).join('')}</order>` +
    element('r_ord', creditNotes.length) +
    `<rorder>${creditNotes.map(refundOf).join('')}</rorder>` +
    element('r_total', money(refundTotal)) +
    '</audit>'

  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(xml)) {
    throw new Error(
      'the audit file carries a character outside ASCII, so its declared encoding would be false'
    )
  }
  return xml
}
