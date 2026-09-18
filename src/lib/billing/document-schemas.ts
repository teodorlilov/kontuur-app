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

/** The two jsonb columns, parsed at the read boundary — the renderer and the audit file never trust raw Json. */
export function parseDocumentCustomer(value: Json): DocumentCustomer {
  return documentCustomerSchema.parse(value)
}

export function parseDocumentLines(value: Json): DocumentLine[] {
  return z.array(documentLineSchema).parse(value)
}
