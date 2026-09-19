import QRCode from 'qrcode'
import { escapeHtml } from '@/lib/email/layout'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { COMPANY } from '@/utils/constants'
import { getZonedParts, toDateKey } from '@/utils/date-helpers'
import { formatDocumentNumber, formatLongDate, formatMoney } from '@/utils/format'
import {
  parseDocumentCustomer,
  parseDocumentLines,
  type DocumentCustomer,
  type VatBasis,
} from './document-schemas'

/** The zone a Bulgarian sale document is dated in, whatever the customer's own. */
const DOCUMENT_TIMEZONE = 'Europe/Sofia'

/**
 * The fiscal tax group printed on every line (Н-18 чл. 52о ал. 1 т. 5): 'Б' for the 20 %
 * Bulgarian rate, 'А' for everything on which no Bulgarian VAT is charged — reverse charge,
 * outside the EU, and another member state's rate under OSS. To be confirmed by the accountant
 * before the first live sale.
 */
export const TAX_GROUPS: Record<VatBasis, 'А' | 'Б'> = {
  domestic: 'Б',
  oss: 'А',
  reverse_charge: 'А',
  outside_eu: 'А',
}

/** The VAT line's legal basis, as the invoice must state it. */
const VAT_BASIS_TEXT: Record<VatBasis, string> = {
  domestic: 'VAT 20 %',
  oss: 'VAT at the customer’s national rate (OSS)',
  reverse_charge: 'Reverse charge, Art. 21(2) Bulgarian VAT Act',
  outside_eu: 'Outside the scope of EU VAT, Art. 21 Bulgarian VAT Act',
}

/** The two identifiers a document cannot be issued without. Refused when unset: a QR without the shop number is a wrong document. */
export function documentIds(): { eShopNumber: string; stripeAccountId: string } {
  const eShopNumber = process.env.NRA_ESHOP_NUMBER
  const stripeAccountId = process.env.STRIPE_ACCOUNT_ID
  if (!eShopNumber) throw new Error('NRA_ESHOP_NUMBER is not set')
  if (!stripeAccountId) throw new Error('STRIPE_ACCOUNT_ID is not set')
  return { eShopNumber, stripeAccountId }
}

/** The document's order number and transaction reference: the Stripe ids the sale, or the refund, is known by. */
function references(
  document: Pick<
    SaleDocumentColumns,
    'kind' | 'stripe_invoice_id' | 'stripe_credit_note_id' | 'stripe_charge_id' | 'stripe_refund_id'
  >
): { order: string; transaction: string } {
  const invoice = document.kind === 'invoice'
  return {
    order: (invoice ? document.stripe_invoice_id : document.stripe_credit_note_id) ?? '',
    transaction: (invoice ? document.stripe_charge_id : document.stripe_refund_id) ?? '',
  }
}

/**
 * What the QR code carries, in the order and with the separator Приложение 18а prescribes:
 * the NRA e-shop number, the order number, the transaction reference, the date, the time and the
 * total — the date and time in Sofia, two decimals on the amount.
 */
export function qrPayload(
  document: Pick<
    SaleDocumentColumns,
    | 'kind'
    | 'stripe_invoice_id'
    | 'stripe_credit_note_id'
    | 'stripe_charge_id'
    | 'stripe_refund_id'
    | 'issued_at'
    | 'gross_cents'
  >,
  eShopNumber: string
): string {
  const issued = new Date(document.issued_at)
  const { hour, minute, second } = getZonedParts(issued, DOCUMENT_TIMEZONE)
  const time = [hour, minute, second].map((part) => String(part).padStart(2, '0')).join(':')
  const { order, transaction } = references(document)
  return [
    eShopNumber,
    order,
    transaction,
    toDateKey(issued, DOCUMENT_TIMEZONE),
    time,
    (document.gross_cents / 100).toFixed(2),
  ].join('*')
}

function customerLines(customer: DocumentCustomer): string[] {
  const address = customer.address
  const street = [address?.line1, address?.line2].filter(Boolean).join(', ')
  const town = [address?.postal_code, address?.city].filter(Boolean).join(' ')
  const lines = [
    customer.name,
    street,
    [town, address?.state, address?.country].filter(Boolean).join(', '),
  ]
  for (const taxId of customer.taxIds) {
    lines.push(taxId.type === 'eu_vat' ? `VAT: ${taxId.value}` : `Reg. no.: ${taxId.value}`)
  }
  if (customer.email) lines.push(customer.email)
  return lines.filter((line): line is string => Boolean(line))
}

const PAGE_STYLE =
  "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#0f1512;"
const LABEL_STYLE = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#667068;'
const CELL = 'padding:6px 8px;border-bottom:1px solid #e7ece7;vertical-align:top;'
const NUMBER_CELL = `${CELL}text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;`

function block(label: string, lines: string[]): string {
  return `<div style="${LABEL_STYLE}">${escapeHtml(label)}</div><div>${lines
    .map((line) => escapeHtml(line))
    .join('<br>')}</div>`
}

/**
 * The invoice or credit note as printable HTML — tables and inline styles, the same discipline
 * as the email shell, because Chromium prints it. English throughout, the company under its
 * registered Latin name: the seller, the customer with its VAT or registration number, the order
 * number and transaction reference, the lines with their tax group (the regulation's own letter
 * codes), the VAT line with its legal basis, the totals in euro, and the QR code.
 * Every item чл. 52о ал. 1 asks for is on the page, so the invoice is the sale document (ал. 3).
 * Async only because the QR encoder is; it does no I/O.
 */
export async function renderSaleDocumentHtml(
  document: SaleDocumentColumns,
  ids: { eShopNumber: string; stripeAccountId: string } = documentIds()
): Promise<string> {
  const invoice = document.kind === 'invoice'
  const basis = document.vat_basis as VatBasis
  const customer = parseDocumentCustomer(document.customer)
  const lines = parseDocumentLines(document.lines)
  const number = formatDocumentNumber(document.number)
  const issued = new Date(document.issued_at)
  const { order, transaction } = references(document)
  const qr = await QRCode.toString(qrPayload(document, ids.eShopNumber), {
    type: 'svg',
    margin: 0,
    width: 120,
  })

  const title = invoice ? 'Invoice' : 'Credit note'
  const rows = lines
    .map(
      (line) =>
        `<tr><td style="${CELL}">${escapeHtml(line.description)}${
          line.periodStart && line.periodEnd
            ? `<br><span style="color:#667068">${escapeHtml(
                `${formatLongDate(new Date(line.periodStart), DOCUMENT_TIMEZONE)} – ${formatLongDate(new Date(line.periodEnd), DOCUMENT_TIMEZONE)}`
              )}</span>`
            : ''
        }</td><td style="${NUMBER_CELL}">${TAX_GROUPS[basis]}</td><td style="${NUMBER_CELL}">${line.quantity}</td><td style="${NUMBER_CELL}">${escapeHtml(formatMoney(line.unitCents))}</td><td style="${NUMBER_CELL}">${escapeHtml(formatMoney(line.netCents))}</td></tr>`
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(`${title} ${number}`)}</title></head>
<body style="margin:0;${PAGE_STYLE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
<td><span style="font-family:Georgia,serif;font-style:italic;font-size:22px">kontuur<span style="color:#164430">.</span></span></td>
<td style="text-align:right"><div style="font-size:18px;font-weight:600">${escapeHtml(title)}</div><div style="font-size:14px;font-variant-numeric:tabular-nums">No. ${number}</div><div>${escapeHtml(formatLongDate(issued, DOCUMENT_TIMEZONE))}</div></td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
<td width="50%" style="vertical-align:top">${block('Seller', [
    COMPANY.legalName,
    COMPANY.address,
    `Reg. no. (UIC): ${COMPANY.uic}`,
    `VAT: ${COMPANY.vatNumber}`,
    `E-shop: ${COMPANY.domain} — NRA no. ${ids.eShopNumber}`,
  ])}</td>
<td width="50%" style="vertical-align:top">${block('Customer', customerLines(customer))}</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
<td width="50%" style="vertical-align:top">${block('Order', [order])}</td>
<td width="50%" style="vertical-align:top">${block('Transaction', [
    transaction,
    'Card payment, Stripe',
    `Virtual POS: ${ids.stripeAccountId}`,
  ])}</td>
</tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #0f1512;margin-bottom:16px">
<thead><tr>
<th style="${CELL}text-align:left;${LABEL_STYLE}">Description</th>
<th style="${NUMBER_CELL}${LABEL_STYLE}">Tax group</th>
<th style="${NUMBER_CELL}${LABEL_STYLE}">Qty</th>
<th style="${NUMBER_CELL}${LABEL_STYLE}">Unit</th>
<th style="${NUMBER_CELL}${LABEL_STYLE}">Net</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
<td style="vertical-align:top">${qr}<div style="font-size:9px;color:#667068;margin-top:4px">${escapeHtml(qrPayload(document, ids.eShopNumber))}</div></td>
<td style="vertical-align:top;text-align:right">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-left:auto">
<tr><td style="${CELL}text-align:right">Net</td><td style="${NUMBER_CELL}">${escapeHtml(formatMoney(document.net_cents))}</td></tr>
<tr><td style="${CELL}text-align:right">${escapeHtml(VAT_BASIS_TEXT[basis])}${document.vat_rate > 0 && basis !== 'domestic' ? ` (${document.vat_rate} %)` : ''}</td><td style="${NUMBER_CELL}">${escapeHtml(formatMoney(document.vat_cents))}</td></tr>
<tr><td style="${CELL}text-align:right;font-weight:600;border-bottom:none">Total</td><td style="${NUMBER_CELL}font-weight:600;border-bottom:none">${escapeHtml(formatMoney(document.gross_cents))}</td></tr>
</table>
</td>
</tr></table>
<p style="font-size:10px;color:#667068;margin:0">Document under Art. 52o of Regulation N-18, issued and delivered electronically. All amounts in euro.</p>
</body>
</html>`
}
