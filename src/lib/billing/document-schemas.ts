import { z } from 'zod'
import type { Json } from '@/types/database'

/** How a sale is taxed on the document — one of four legal bases, decided from Stripe's tax line. */
export const VAT_BASES = ['domestic', 'oss', 'reverse_charge', 'outside_eu'] as const
export type VatBasis = (typeof VAT_BASES)[number]

/** The customer as the invoice must name them, snapshotted from the Stripe invoice at issue. */
export const documentCustomerSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  address: z
    .object({
      line1: z.string().nullable(),
      line2: z.string().nullable(),
      city: z.string().nullable(),
      postal_code: z.string().nullable(),
      state: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable(),
  taxIds: z.array(z.object({ type: z.string(), value: z.string() })),
})
export type DocumentCustomer = z.infer<typeof documentCustomerSchema>

/** One line of the document: what was sold, how many, at what net price, for which period. */
export const documentLineSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitCents: z.number(),
  netCents: z.number(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
})
export type DocumentLine = z.infer<typeof documentLineSchema>

/** The customer jsonb column, parsed at the read boundary — the renderer and the audit file never trust raw Json. */
export function parseDocumentCustomer(value: Json): DocumentCustomer {
  return documentCustomerSchema.parse(value)
}

/** The lines jsonb column, parsed at the read boundary like the customer. */
export function parseDocumentLines(value: Json): DocumentLine[] {
  return z.array(documentLineSchema).parse(value)
}

/**
 * The `vat_basis` text column, parsed at the read boundary like the jsonb columns: a basis outside
 * `VAT_BASES` throws rather than print a document with no legal basis for its VAT line.
 */
export function parseVatBasis(value: string): VatBasis {
  return z.enum(VAT_BASES).parse(value)
}

/**
 * The document's tax point — the payment's date for an invoice, the credit note's own creation
 * for a credit note (`issueCreditNote`, documents.ts) — beside `issued_at`, which is the date the document was issued. Every document carries one
 * (migration 20260861 backfilled the older rows, and the issuer always sends it); one without
 * throws rather than borrowing another date for a legal record.
 */
export function taxPointOf(document: { number: number; tax_event_at: string | null }): Date {
  if (!document.tax_event_at) throw new Error(`document ${document.number} has no tax point`)
  return new Date(document.tax_event_at)
}
