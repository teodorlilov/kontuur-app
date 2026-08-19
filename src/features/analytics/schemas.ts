import { z } from 'zod'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Input for archiving the currently displayed period into analytics_reports. */
export const archiveReportInputSchema = z
  .object({
    clientId: z.string().uuid(),
    preset: z.enum(['7d', '30d', '90d', 'custom']),
    start: z.string().regex(DATE_KEY),
    end: z.string().regex(DATE_KEY),
  })
  .refine((input) => input.start <= input.end, { message: 'start must not be after end' })

export type ArchiveReportInput = z.infer<typeof archiveReportInputSchema>
