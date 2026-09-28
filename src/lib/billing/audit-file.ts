import { z } from 'zod'
import { escapeHtml } from '@/lib/email/layout'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { DOCUMENT_TIMEZONE, MS_PER_DAY } from '@/utils/constants'
import { toDateKey } from '@/utils/date-helpers'
import { centsToDecimal } from '@/utils/format'
import { parseDocumentLines, taxPointOf } from './document-schemas'

/**
 * A month the NRA's schema (docs/n18/dec_audit.xsd) cannot carry as it stands — a question for the
 * accountant, not a fault: the download route answers it 409 with this sentence.
 */
export class AuditFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuditFileError'
  }
}

/** Приложение 38's payment codes: a card charge through a virtual POS is 2, a refund back to the card is 2 as well. */
const PAYMENT_VIRTUAL_POS = 2
const REFUND_TO_CARD = 2

/** The payment service provider named on every order, as `proc_id`. */
const PROCESSOR = 'Stripe Technology Europe Limited'

/** A `YYYY-MM` month, its year and month digits captured. */
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** `?month=YYYY-MM`, the only input the download route takes. */
export const auditMonthSchema = z.string().regex(MONTH_PATTERN, 'month must be YYYY-MM')

/** A month as its year and month digits. Throws on anything `auditMonthSchema` refuses. */
function monthParts(month: string): { year: string; month: string } {
  const [, year, monthDigits] = MONTH_PATTERN.exec(month) ?? []
  if (!year || !monthDigits) throw new Error(`${month} is not a YYYY-MM month`)
  return { year, month: monthDigits }
}

interface AuditSeller {
  eik: string
  eShopNumber: string
  domain: string
  stripeAccountId: string
}

/**
 * The half-open UTC range that surely contains every instant of a Sofia calendar month — a day
 * of slack on each side, so the read is one query and `documentsOfMonth` does the exact cut. Throws
 * on a month `auditMonthSchema` refuses.
 */
export function monthReadRange(month: string): { fromIso: string; toIso: string } {
  const parts = monthParts(month)
  const year = Number(parts.year)
  const monthNumber = Number(parts.month)
  return {
    fromIso: new Date(Date.UTC(year, monthNumber - 1, 1) - MS_PER_DAY).toISOString(),
    toIso: new Date(Date.UTC(year, monthNumber, 1) + MS_PER_DAY).toISOString(),
  }
}

/** The documents whose Sofia issue date falls in `month` — a document is filed in the month it was issued. */
export function documentsOfMonth(
  documents: SaleDocumentColumns[],
  month: string
): SaleDocumentColumns[] {
  return documents.filter((document) =>
    toDateKey(new Date(document.issued_at), DOCUMENT_TIMEZONE).startsWith(month)
  )
}

function dateOf(date: Date): string {
  return toDateKey(date, DOCUMENT_TIMEZONE)
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

/**
 * One sale as an order: its date is the payment's (the tax point), its document date the issue's.
 * The schema takes the VAT rate as a whole percentage (`art_vat_rate`, an integer), so a document
 * at a fractional rate — some member states' OSS rates — is refused with the question for the
 * accountant rather than rounded into a false line.
 */
function orderOf(document: SaleDocumentColumns, seller: AuditSeller): string {
  if (!Number.isInteger(document.vat_rate)) {
    throw new AuditFileError(
      `Document ${document.number} carries VAT at ${document.vat_rate} %, but the audit file takes whole percentages only. Ask the accountant how to report it.`
    )
  }
  const lines = parseDocumentLines(document.lines)
  const vatShares = splitVat(
    document.vat_cents,
    lines.map((line) => line.netCents)
  )
  const articles = lines.map((line, index) => {
    const vat = vatShares[index] ?? 0
    return (
      '<artenum>' +
      element('art_name', ascii(line.description) || 'Kontuur subscription') +
      element('art_quant', line.quantity) +
      element('art_price', centsToDecimal(line.unitCents)) +
      element('art_vat_rate', document.vat_rate) +
      element('art_vat', centsToDecimal(vat)) +
      element('art_sum', centsToDecimal(line.netCents + vat)) +
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
    element('ord_d', dateOf(taxPointOf(document))) +
    element('doc_n', document.number) +
    element('doc_date', dateOf(new Date(document.issued_at))) +
    `<art>${articles.join('')}</art>` +
    element('ord_total1', centsToDecimal(document.net_cents)) +
    element('ord_disc', centsToDecimal(0)) +
    element('ord_vat', centsToDecimal(document.vat_cents)) +
    element('ord_total2', centsToDecimal(document.gross_cents)) +
    element('paym', PAYMENT_VIRTUAL_POS) +
    element('pos_n', seller.stripeAccountId) +
    element('trans_n', document.stripe_charge_id ?? '') +
    element('proc_id', PROCESSOR) +
    '</orderenum>'
  )
}

/** One credit note as a returned order, dated by its tax point: when the credit note was made. */
function refundOf(document: SaleDocumentColumns): string {
  return (
    '<rorderenum>' +
    element('r_ord_n', document.stripe_invoice_id ?? '') +
    element('r_amount', centsToDecimal(document.gross_cents)) +
    element('r_date', dateOf(taxPointOf(document))) +
    element('r_paym', REFUND_TO_CARD) +
    '</rorderenum>'
  )
}

/**
 * One month's standardised audit file, as `docs/n18/dec_audit.xsd` describes it (Приложение 38):
 * the shop header, one order per invoice document with its lines, one refund per credit note,
 * and `r_ord`, the number of orders returned in whole or in part — distinct invoices, however
 * many notes each had. Amounts in euro with two decimals, summing exactly or throwing — a wrong
 * file never leaves the machine. Null when the month holds no document. A month of refunds and
 * no sale throws `AuditFileError`: the schema requires at least one order. `month` is one
 * `auditMonthSchema` accepts; any other throws. Pure.
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
  if (invoices.length === 0) {
    throw new AuditFileError(
      `${input.month} holds credit notes but no sale, and the audit file needs at least one order. Ask the accountant how to report the refunds alone.`
    )
  }

  const { year, month } = monthParts(input.month)
  const refundTotal = creditNotes.reduce((sum, document) => sum + document.gross_cents, 0)
  const xml =
    '<?xml version="1.0" encoding="windows-1251"?>' +
    '<audit>' +
    element('eik', input.seller.eik) +
    element('e_shop_n', input.seller.eShopNumber) +
    element('domain_name', input.seller.domain) +
    element('e_shop_type', 1) +
    element('creation_date', dateOf(input.createdOn)) +
    element('mon', month) +
    element('god', year) +
    `<order>${invoices.map((document) => orderOf(document, input.seller)).join('')}</order>` +
    element('r_ord', new Set(creditNotes.map((document) => document.stripe_invoice_id)).size) +
    `<rorder>${creditNotes.map(refundOf).join('')}</rorder>` +
    element('r_total', centsToDecimal(refundTotal)) +
    '</audit>'

  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(xml)) {
    throw new Error(
      'the audit file carries a character outside ASCII, so its declared encoding would be false'
    )
  }
  return xml
}
