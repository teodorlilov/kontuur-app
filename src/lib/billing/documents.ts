import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { sendEmail } from '@/lib/email/resend'
import { documentEmail } from '@/lib/email/templates'
import {
  fetchSaleDocumentById,
  fetchSaleDocumentByStripeInvoice,
  fetchUndeliveredSaleDocuments,
} from '@/lib/queries/db'
import type { SaleDocumentColumns } from '@/lib/queries/select-columns'
import { renderPdf } from '@/lib/render/pdf'
import type { Database, Json, TablesInsert } from '@/types/database'
import { BILLING_DOCUMENTS_BUCKET, PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { formatDocumentNumber } from '@/utils/format'
import { resolveAppUrl } from '@/utils/url'
import { renderSaleDocumentHtml } from './document-render'
import {
  parseDocumentCustomer,
  type DocumentCustomer,
  type DocumentLine,
  type VatBasis,
} from './document-schemas'
import { stripeClient } from './stripe'

type Admin = SupabaseClient<Database>

/** What the issuer supplies; the RPC assigns the number and the timestamps. */
type IssueInput = Omit<
  TablesInsert<'sale_documents'>,
  'id' | 'number' | 'created_at' | 'storage_path' | 'delivered_at' | 'delivery_error'
>

/** The member states — what decides "outside the EU" when no tax was collected. */
const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
])

/** A document may sit undelivered this long before the daily retry takes it: the webhook's own `after()` gets that much room. */
const RETRY_AFTER_MS = 10 * 60_000

function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

/**
 * The legal basis of the VAT line, from Stripe's tax line and the tax rate it names — never from
 * the address alone: under the "small seller" option an EU consumer is charged Bulgarian VAT,
 * and only the rate's country says so. Anything this cannot name throws, so the event fails,
 * Stripe retries, and nothing half-issued is written: `not_collecting` with an EU address means
 * VAT was due and not charged — a registration gap to fix, not a document to issue.
 */
export function vatBasisOf(
  tax: Stripe.Invoice.TotalTax | null,
  rate: Stripe.TaxRate | null,
  customerCountry: string | null
): VatBasis {
  const reason = tax?.taxability_reason ?? 'not_collecting'
  if (reason === 'reverse_charge') return 'reverse_charge'
  if (reason === 'standard_rated' || reason === 'reduced_rated') {
    if (rate?.country === 'BG') return 'domestic'
    if (rate?.country && EU_COUNTRIES.has(rate.country)) return 'oss'
    throw new Error(
      `tax rate country ${rate?.country ?? 'unknown'} is not one this document can name`
    )
  }
  if (
    (reason === 'not_collecting' || reason === 'not_subject_to_tax') &&
    customerCountry &&
    !EU_COUNTRIES.has(customerCountry)
  ) {
    return 'outside_eu'
  }
  throw new Error(
    `tax reason "${reason}" for a customer in ${customerCountry ?? 'no country'} — VAT was due and not charged, or a case this document does not know`
  )
}

/** The one write: the RPC takes the next number and inserts in one transaction, or returns the row it already made for this Stripe id. */
async function issue(admin: Admin, input: IssueInput): Promise<SaleDocumentColumns> {
  // WHY as: the RPC takes one jsonb argument, and the table's own Insert shape is not something
  // the generated Json type can name structurally.
  const { data, error } = await admin.rpc('issue_sale_document', { p: input as unknown as Json })
  if (error) throw new Error(`issue_sale_document failed: ${error.message}`)
  return data
}

/**
 * The invoice for a paid Stripe invoice — also the Н-18 sale document (чл. 52о ал. 3). Reads the
 * invoice once more with its payment expanded, the tax rate it names, and writes the snapshot the
 * document is rendered from: the customer as Stripe knew them at payment, the lines, the totals,
 * the VAT basis and rate, the charge that paid it. A €0 invoice yields nothing — no payment, no
 * document. Idempotent by Stripe invoice id, in the RPC. `agencyId` is null for a payment that
 * arrives after its workspace was deleted: the document is owed all the same, and everything it
 * renders and mails comes from the snapshot, never from the workspace.
 */
export async function issueSaleDocument(
  admin: Admin,
  input: { invoiceId: string; agencyId: string | null }
): Promise<SaleDocumentColumns | null> {
  const stripe = stripeClient()
  const invoice = await stripe.invoices.retrieve(input.invoiceId, {
    expand: ['payments.data.payment.payment_intent'],
  })
  if (invoice.amount_paid === 0) return null
  if (invoice.currency !== 'eur') {
    throw new Error(`invoice ${invoice.id} is in ${invoice.currency}; Kontuur bills in euro only`)
  }

  const tax = invoice.total_taxes?.[0] ?? null
  const rate = tax?.tax_rate_details
    ? await stripe.taxRates.retrieve(tax.tax_rate_details.tax_rate)
    : null
  const address = invoice.customer_address
  const vatBasis = vatBasisOf(tax, rate, address?.country ?? null)

  const paymentIntent = invoice.payments?.data[0]?.payment.payment_intent
  const charge =
    typeof paymentIntent === 'object' && paymentIntent ? paymentIntent.latest_charge : null

  const customer: DocumentCustomer = {
    name: invoice.customer_name,
    email: invoice.customer_email,
    address: address
      ? {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          postal_code: address.postal_code,
          state: address.state,
          country: address.country,
        }
      : null,
    taxIds: (invoice.customer_tax_ids ?? []).map((taxId) => ({
      type: taxId.type,
      value: taxId.value ?? '',
    })),
  }
  const lines: DocumentLine[] = invoice.lines.data.map((line) => ({
    description: line.description ?? 'Kontuur',
    quantity: line.quantity ?? 1,
    unitCents: Math.round(
      Number(line.pricing?.unit_amount_decimal ?? line.amount / Math.max(1, line.quantity ?? 1))
    ),
    netCents: line.amount,
    periodStart: isoFromUnix(line.period.start),
    periodEnd: isoFromUnix(line.period.end),
  }))

  return issue(admin, {
    kind: 'invoice',
    agency_id: input.agencyId,
    stripe_invoice_id: invoice.id,
    stripe_charge_id: typeof charge === 'string' ? charge : (charge?.id ?? null),
    issued_at: isoFromUnix(invoice.status_transitions.paid_at ?? invoice.created),
    customer,
    lines,
    net_cents: invoice.total_excluding_tax ?? invoice.subtotal,
    vat_cents: tax?.amount ?? 0,
    gross_cents: invoice.total,
    vat_rate: rate ? Math.round(rate.percentage) : 0,
    vat_basis: vatBasis,
  })
}

/**
 * The credit note for a Stripe credit note that refunded money — and only those: a pre-payment
 * note moves no money, and a credit to the customer's balance is not a refund the audit file may
 * report as one. It refunds the invoice document by reference, keeps that document's customer,
 * VAT basis and rate, and takes its amounts from the note. Idempotent by credit note id.
 */
export async function issueCreditNote(
  admin: Admin,
  creditNoteId: string
): Promise<SaleDocumentColumns | null> {
  const note = await stripeClient().creditNotes.retrieve(creditNoteId)
  if (note.type !== 'post_payment' || note.refunds.length === 0) return null
  if (note.currency !== 'eur') {
    throw new Error(`credit note ${note.id} is in ${note.currency}; Kontuur bills in euro only`)
  }
  const invoiceId = typeof note.invoice === 'string' ? note.invoice : note.invoice.id
  const invoiceDocument = await fetchSaleDocumentByStripeInvoice(invoiceId)
  if (!invoiceDocument) {
    throw new Error(`credit note ${note.id} refunds invoice ${invoiceId}, which has no document`)
  }
  const refund = note.refunds[0]?.refund
  const line: DocumentLine = {
    description: `Кредитно известие към фактура / Credit note to invoice № ${formatDocumentNumber(invoiceDocument.number)}`,
    quantity: 1,
    unitCents: note.subtotal,
    netCents: note.subtotal,
    periodStart: null,
    periodEnd: null,
  }
  return issue(admin, {
    kind: 'credit_note',
    agency_id: invoiceDocument.agency_id,
    stripe_invoice_id: invoiceId,
    stripe_credit_note_id: note.id,
    stripe_charge_id: invoiceDocument.stripe_charge_id,
    stripe_refund_id: typeof refund === 'string' ? refund : (refund?.id ?? null),
    refunds: invoiceDocument.id,
    issued_at: isoFromUnix(note.created),
    customer: invoiceDocument.customer,
    lines: [line],
    net_cents: note.subtotal,
    vat_cents: note.total_taxes?.[0]?.amount ?? note.total - note.subtotal,
    gross_cents: note.total,
    vat_rate: invoiceDocument.vat_rate,
    vat_basis: invoiceDocument.vat_basis,
  })
}

/**
 * Hand one document over: render, print, keep the PDF in the private bucket, email it to the
 * payer, stamp the row. Once — a delivered row is never re-sent, the upload is an upsert, and
 * the Resend idempotency key means an email that went out before a lost stamp is not sent twice
 * by the retry. Any failure is written to the row and reported, never thrown: the webhook's
 * `after()` and the daily retry both call this, and the row is what says whether it worked.
 */
export async function deliverSaleDocument(
  admin: Admin,
  id: string
): Promise<'delivered' | 'failed'> {
  const document = await fetchSaleDocumentById(id)
  if (!document) throw new Error(`sale document ${id} does not exist`)
  if (document.delivered_at) return 'delivered'

  try {
    const pdf = await renderPdf(await renderSaleDocumentHtml(document))
    const storagePath = `${document.agency_id ?? 'unassigned'}/${formatDocumentNumber(document.number)}.pdf`
    const { error: uploadError } = await admin.storage
      .from(BILLING_DOCUMENTS_BUCKET)
      .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw new Error(`document upload failed: ${uploadError.message}`)

    const customer = parseDocumentCustomer(document.customer)
    if (!customer.email) throw new Error('the invoice carries no customer email')
    await sendEmail({
      to: customer.email,
      content: documentEmail(document, `${resolveAppUrl()}${PLAN_AND_BILLING_PATH}`),
      attachments: [
        { filename: `kontuur-${formatDocumentNumber(document.number)}.pdf`, content: pdf },
      ],
      idempotencyKey: `document:${document.id}`,
    })

    const { error } = await admin
      .from('sale_documents')
      .update({
        storage_path: storagePath,
        delivered_at: new Date().toISOString(),
        delivery_error: null,
      })
      .eq('id', id)
    if (error) throw new Error(`delivery stamp failed: ${error.message}`)
    return 'delivered'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[billing:documents] delivery failed for ${id}:`, message)
    await admin.from('sale_documents').update({ delivery_error: message }).eq('id', id)
    return 'failed'
  }
}

/** The daily backstop: every document nobody has received, old enough that the webhook's own attempt is over, goes through delivery again. */
export async function retryUndeliveredDocuments(
  admin: Admin
): Promise<{ retried: number; delivered: number }> {
  const stale = await fetchUndeliveredSaleDocuments(
    new Date(Date.now() - RETRY_AFTER_MS).toISOString()
  )
  let delivered = 0
  for (const document of stale) {
    if ((await deliverSaleDocument(admin, document.id)) === 'delivered') delivered++
  }
  return { retried: stale.length, delivered }
}

/** The documents with a download link each — one signed URL per stored PDF, good for an hour, minted for the admin's own list. */
export async function listDocumentDownloads(
  admin: Admin,
  documents: SaleDocumentColumns[]
): Promise<Array<SaleDocumentColumns & { url: string | null }>> {
  const paths = documents
    .map((document) => document.storage_path)
    .filter((path): path is string => path !== null)
  if (paths.length === 0) return documents.map((document) => ({ ...document, url: null }))

  const { data, error } = await admin.storage
    .from(BILLING_DOCUMENTS_BUCKET)
    .createSignedUrls(paths, 3600)
  if (error) throw new Error(`signed urls failed: ${error.message}`)
  const byPath = new Map(data.map((entry) => [entry.path ?? '', entry.signedUrl]))
  return documents.map((document) => ({
    ...document,
    url: document.storage_path ? (byPath.get(document.storage_path) ?? null) : null,
  }))
}
