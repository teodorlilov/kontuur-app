import 'server-only'

import type Stripe from 'stripe'
import { sendEmail } from '@/lib/email/resend'
import { documentEmail } from '@/lib/email/templates'
import { readPages } from '@/lib/queries/read-pages'
import { SALE_DOCUMENT_COLUMNS, type SaleDocumentColumns } from '@/lib/queries/select-columns'
import { unwrap } from '@/lib/queries/unwrap'
import { renderPdf } from '@/lib/render/pdf'
import type { AdminClient } from '@/lib/supabase/admin'
import type { Json, TablesInsert } from '@/types/database'
import { BILLING_DOCUMENTS_BUCKET, PLAN_AND_BILLING_PATH } from '@/utils/constants'
import { isoFromUnixSeconds } from '@/utils/date-helpers'
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

/** What the issuer supplies; the RPC assigns the number and the document date (`issued_at`). */
type IssueInput = Omit<
  TablesInsert<'sale_documents'>,
  'id' | 'number' | 'issued_at' | 'created_at' | 'storage_path' | 'delivered_at' | 'delivery_error'
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

/**
 * Every invoice and credit note of one workspace, newest first — the Account tab's list. The admin
 * client throughout this file: the tenant role never reads a document row directly, so the caller
 * proves the admin role and passes its own agency.
 */
export async function fetchSaleDocumentsByAgency(
  admin: AdminClient,
  agencyId: string
): Promise<SaleDocumentColumns[]> {
  return (
    unwrap(
      await admin
        .from('sale_documents')
        .select(SALE_DOCUMENT_COLUMNS)
        .eq('agency_id', agencyId)
        .order('issued_at', { ascending: false }),
      'fetchSaleDocumentsByAgency'
    ) ?? []
  )
}

/**
 * Documents dated in `[from, to)`, in number order — one calendar month for the audit file, read
 * whole (`readPages`), since a month cut at PostgREST's row cap would still build a valid file.
 */
export async function fetchSaleDocumentsBetween(
  admin: AdminClient,
  fromIso: string,
  toIso: string
): Promise<SaleDocumentColumns[]> {
  const documents: SaleDocumentColumns[] = []
  const pages = readPages('fetchSaleDocumentsBetween', (from, to) =>
    admin
      .from('sale_documents')
      .select(SALE_DOCUMENT_COLUMNS)
      .gte('issued_at', fromIso)
      .lt('issued_at', toIso)
      .order('number', { ascending: true })
      .range(from, to)
  )
  for await (const page of pages) documents.push(...page)
  return documents
}

async function fetchSaleDocumentById(
  admin: AdminClient,
  id: string
): Promise<SaleDocumentColumns | null> {
  return unwrap(
    await admin.from('sale_documents').select(SALE_DOCUMENT_COLUMNS).eq('id', id).maybeSingle(),
    'fetchSaleDocumentById'
  )
}

/** The invoice document a Stripe invoice became, or null — what a credit note refunds. */
async function fetchSaleDocumentByStripeInvoice(
  admin: AdminClient,
  stripeInvoiceId: string
): Promise<SaleDocumentColumns | null> {
  return unwrap(
    await admin
      .from('sale_documents')
      .select(SALE_DOCUMENT_COLUMNS)
      .eq('kind', 'invoice')
      .eq('stripe_invoice_id', stripeInvoiceId)
      .maybeSingle(),
    'fetchSaleDocumentByStripeInvoice'
  )
}

/**
 * The ids of every document nobody has received yet, created before `beforeIso`, oldest first —
 * all pages of them (`readPages`), ordered on `id` after `created_at` so two documents made in one
 * instant sit in one place.
 */
async function fetchUndeliveredSaleDocumentIds(
  admin: AdminClient,
  beforeIso: string
): Promise<string[]> {
  const ids: string[] = []
  const pages = readPages('fetchUndeliveredSaleDocumentIds', (from, to) =>
    admin
      .from('sale_documents')
      .select('id')
      .is('delivered_at', null)
      .lt('created_at', beforeIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  )
  for await (const page of pages) ids.push(...page.map((row) => row.id))
  return ids
}

/**
 * Whether a paid invoice took money from the card — the one reading of "a sale happened". A €0
 * invoice is no sale and gets no document; the webhook asks the same question of an invoice it
 * cannot document (`undocumented_sale`).
 */
export function chargedMoney(invoice: Pick<Stripe.Invoice, 'amount_paid'>): boolean {
  return invoice.amount_paid > 0
}

/**
 * The legal basis of the VAT line, from Stripe's tax line and the tax rate it names — never from
 * the address alone: under the "small seller" option an EU consumer is charged Bulgarian VAT,
 * and only the rate's country says so. Only the standard rate is named: the service is sold at no
 * reduced rate, so a `reduced_rated` line is a Stripe Tax setting to fix. Anything this cannot
 * name throws, so the event fails, Stripe retries, and nothing half-issued is written:
 * `not_collecting` with an EU address means VAT was due and not charged — a registration gap to
 * fix, not a document to issue.
 */
export function vatBasisOf(
  tax: Stripe.Invoice.TotalTax | null,
  rate: Stripe.TaxRate | null,
  customerCountry: string | null
): VatBasis {
  const reason = tax?.taxability_reason ?? 'not_collecting'
  if (reason === 'reverse_charge') return 'reverse_charge'
  if (reason === 'standard_rated') {
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

/**
 * The one write: the RPC takes the next number and inserts in one transaction, or returns the row
 * it already made for this Stripe id. WHY as: the RPC takes one jsonb argument, and the table's
 * own Insert shape is not something the generated Json type can name structurally.
 */
async function issue(admin: AdminClient, input: IssueInput): Promise<SaleDocumentColumns> {
  const { data, error } = await admin.rpc('issue_sale_document', { p: input as unknown as Json })
  if (error) throw new Error(`issue_sale_document failed: ${error.message}`)
  return data
}

/**
 * Throw for an invoice a customer balance or a pre-payment credit note touched, naming which: its
 * total is then not what the card paid, and the audit file has no line for money held on account.
 * Checked before anything else, so an invoice paid wholly from a balance throws rather than
 * passing as a €0 invoice. None arises from this app's own billing — no change books a credit
 * (`syncSubscriptionQuantity`) — so one that does is a hand edit to undo.
 */
function refuseBalances(invoice: Stripe.Invoice): void {
  if (invoice.starting_balance < 0) {
    throw new Error(
      `invoice ${invoice.id} was paid in part from a customer credit (starting_balance ${invoice.starting_balance})`
    )
  }
  if (invoice.starting_balance > 0) {
    throw new Error(
      `invoice ${invoice.id} carries a debt from an earlier invoice (starting_balance ${invoice.starting_balance})`
    )
  }
  if (invoice.pre_payment_credit_notes_amount > 0) {
    throw new Error(
      `invoice ${invoice.id} was reduced by a pre-payment credit note (pre_payment_credit_notes_amount ${invoice.pre_payment_credit_notes_amount})`
    )
  }
}

/**
 * The invoice for a paid Stripe invoice — also the Н-18 sale document (чл. 52о ал. 3) — written as
 * the snapshot everything is rendered and mailed from, never the workspace, so `agencyId` may be
 * null (paid after its workspace was deleted: the document is owed all the same). The payment's
 * date is the tax point (`tax_event_at`); the RPC dates the document and is idempotent by invoice
 * id. A €0 invoice yields nothing (`chargedMoney`); a balance (`refuseBalances`), a part payment or
 * no card charge (marked paid by hand) throws: the document states the whole total, and it and the
 * audit file name the card charge through the virtual POS.
 */
export async function issueSaleDocument(
  admin: AdminClient,
  input: { invoiceId: string; agencyId: string | null }
): Promise<SaleDocumentColumns | null> {
  const stripe = stripeClient()
  const invoice = await stripe.invoices.retrieve(input.invoiceId, {
    expand: ['payments.data.payment.payment_intent'],
  })
  refuseBalances(invoice)
  if (!chargedMoney(invoice)) return null
  if (invoice.amount_paid !== invoice.total) {
    throw new Error(
      `invoice ${invoice.id} was paid ${invoice.amount_paid} of its total ${invoice.total}`
    )
  }
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
  const chargeId = typeof charge === 'string' ? charge : (charge?.id ?? null)
  if (!chargeId) {
    throw new Error(`invoice ${invoice.id} was paid with no card charge; its document names one`)
  }

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
    periodStart: isoFromUnixSeconds(line.period.start),
    periodEnd: isoFromUnixSeconds(line.period.end),
  }))

  return issue(admin, {
    kind: 'invoice',
    agency_id: input.agencyId,
    stripe_invoice_id: invoice.id,
    stripe_charge_id: chargeId,
    tax_event_at: isoFromUnixSeconds(invoice.status_transitions.paid_at ?? invoice.created),
    customer,
    lines,
    net_cents: invoice.total_excluding_tax ?? invoice.subtotal,
    vat_cents: tax?.amount ?? 0,
    gross_cents: invoice.total,
    vat_rate: rate ? rate.percentage : 0,
    vat_basis: vatBasis,
  })
}

/**
 * The refund a credit note documents — one of the two shapes the audit file can report, or a
 * throw naming what it was: one refund to the card of the note's whole total, or no refund and the
 * whole total out of band, the convention for a chargeback the bank won (docs/n18/README.md,
 * Refunds). A credit to the customer's balance returns no money, and a part or split refund would
 * report a return that did not happen as described.
 */
function returnedMoney(note: Stripe.CreditNote): { refundId: string | null } {
  if (note.customer_balance_transaction) {
    throw new Error(`credit note ${note.id} credits the customer's balance, which returns no money`)
  }
  const outOfBand = note.out_of_band_amount ?? 0
  const [only, ...more] = note.refunds
  if (only && more.length === 0 && outOfBand === 0 && only.amount_refunded === note.total) {
    return { refundId: typeof only.refund === 'string' ? only.refund : only.refund.id }
  }
  if (!only && outOfBand === note.total) return { refundId: null }
  throw new Error(
    `credit note ${note.id} returns ${note.total} as ${note.refunds.length} refund(s) and ${outOfBand} out of band; only one refund of the whole total, or the whole total out of band, can be documented`
  )
}

/**
 * The credit note for a Stripe credit note that returned money (`returnedMoney`); a pre-payment
 * note moves no money and yields nothing. It refunds the invoice document by reference and keeps
 * that document's customer, VAT basis and rate, with its amounts from the note and the note's
 * date as its tax point. It also carries the invoice's Stripe ids beside the `refunds` link:
 * they are frozen onto the legal record so the audit file needs no second lookup, and the charge
 * id is the transaction of a chargeback, which has no refund of its own. Idempotent by credit
 * note id, through the insert-only RPC.
 */
export async function issueCreditNote(
  admin: AdminClient,
  creditNoteId: string
): Promise<SaleDocumentColumns | null> {
  const note = await stripeClient().creditNotes.retrieve(creditNoteId)
  if (note.type === 'pre_payment') return null
  if (note.currency !== 'eur') {
    throw new Error(`credit note ${note.id} is in ${note.currency}; Kontuur bills in euro only`)
  }
  const { refundId } = returnedMoney(note)
  const invoiceId = typeof note.invoice === 'string' ? note.invoice : note.invoice.id
  const invoiceDocument = await fetchSaleDocumentByStripeInvoice(admin, invoiceId)
  if (!invoiceDocument) {
    throw new Error(`credit note ${note.id} refunds invoice ${invoiceId}, which has no document`)
  }
  const line: DocumentLine = {
    description: `Credit note to invoice No. ${formatDocumentNumber(invoiceDocument.number)}`,
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
    stripe_refund_id: refundId,
    refunds: invoiceDocument.id,
    tax_event_at: isoFromUnixSeconds(note.created),
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
 * Render, print and keep a document's PDF in the private bucket, then record where — before any
 * email goes out, so a retry sends these same bytes rather than rendering new ones. A path that
 * cannot be recorded throws, and nothing is sent.
 */
async function storePdf(admin: AdminClient, document: SaleDocumentColumns): Promise<Buffer> {
  const pdf = await renderPdf(await renderSaleDocumentHtml(document))
  const path = `${document.agency_id ?? 'unassigned'}/${formatDocumentNumber(document.number)}.pdf`
  const { error: uploadError } = await admin.storage
    .from(BILLING_DOCUMENTS_BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw new Error(`document upload failed: ${uploadError.message}`)
  const { error } = await admin
    .from('sale_documents')
    .update({ storage_path: path })
    .eq('id', document.id)
  if (error) throw new Error(`document path write failed: ${error.message}`)
  return pdf
}

/** The PDF a first attempt already kept. */
async function storedPdf(admin: AdminClient, path: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(BILLING_DOCUMENTS_BUCKET).download(path)
  if (error) throw new Error(`document download failed: ${error.message}`)
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Hand one document over: keep its PDF (`storePdf`), email it to the payer, stamp the row — once;
 * a delivered row is never re-sent. Every attempt sends the same stored bytes under the same
 * Resend idempotency key, so a mail sent before a lost stamp is not sent twice within the 24 hours
 * Resend keeps the key (src/lib/email/resend.ts); after that, it can be. Never throws: any
 * failure, the row's own read included, is logged and written to the row, since the webhook's
 * `after()` and the daily retry's batch both call this and the row says whether it worked.
 */
export async function deliverSaleDocument(
  admin: AdminClient,
  id: string
): Promise<'delivered' | 'failed'> {
  try {
    const document = await fetchSaleDocumentById(admin, id)
    if (!document) throw new Error(`sale document ${id} does not exist`)
    if (document.delivered_at) return 'delivered'
    const customer = parseDocumentCustomer(document.customer)
    if (!customer.email) throw new Error('the document carries no customer email')
    const pdf = document.storage_path
      ? await storedPdf(admin, document.storage_path)
      : await storePdf(admin, document)
    await sendEmail({
      to: customer.email,
      content: documentEmail(
        document,
        document.agency_id ? `${resolveAppUrl()}${PLAN_AND_BILLING_PATH}` : null
      ),
      attachments: [
        { filename: `kontuur-${formatDocumentNumber(document.number)}.pdf`, content: pdf },
      ],
      idempotencyKey: `document:${document.id}`,
    })

    const { error } = await admin
      .from('sale_documents')
      .update({ delivered_at: new Date().toISOString(), delivery_error: null })
      .eq('id', id)
    if (error) throw new Error(`delivery stamp failed: ${error.message}`)
    return 'delivered'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[billing:documents] delivery failed for ${id}:`, message)
    const { error } = await admin
      .from('sale_documents')
      .update({ delivery_error: message })
      .eq('id', id)
    if (error) {
      console.error(`[billing:documents] recording the failure failed for ${id}:`, error.message)
    }
    return 'failed'
  }
}

/**
 * The daily backstop: every document nobody has received, older than `RETRY_AFTER_MS`, goes
 * through delivery again, oldest first, none started past `deadline`
 * (src/app/api/cron/billing/route.ts). All ids are read before the first send, because a delivery
 * takes its row out of the filter and would shift the pages after it. A fast failure cannot starve
 * the rows behind it, but one whose render or send hangs to its timeout runs first every day and
 * can use most of the deadline — only a last-attempt stamp (a new column) would rotate it.
 */
export async function retryUndeliveredDocuments(
  admin: AdminClient,
  deadline: number
): Promise<{ retried: number; delivered: number }> {
  const ids = await fetchUndeliveredSaleDocumentIds(
    admin,
    new Date(Date.now() - RETRY_AFTER_MS).toISOString()
  )
  let retried = 0
  let delivered = 0
  for (const id of ids) {
    if (Date.now() > deadline) break
    retried++
    if ((await deliverSaleDocument(admin, id)) === 'delivered') delivered++
  }
  return { retried, delivered }
}

/** The documents with a download link each — one signed URL per stored PDF, good for an hour, minted for the admin's own list. */
export async function listDocumentDownloads(
  admin: AdminClient,
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
