import { z } from 'zod'
import { CUSTOM_MAX_DAYS, DATE_KEY_PATTERN, dayCount, RANGE_PRESETS } from './lib/period'

/** Input for archiving the currently displayed period into analytics_reports. */
export const archiveReportInputSchema = z
  .object({
    clientId: z.string().uuid(),
    preset: z.enum([...RANGE_PRESETS, 'custom']),
    start: z.string().regex(DATE_KEY_PATTERN),
    end: z.string().regex(DATE_KEY_PATTERN),
    // Which network's report the action is about. Optional with the Instagram default so
    // every existing caller keeps meaning what it meant.
    network: z.enum(['instagram', 'facebook']).default('instagram'),
  })
  .refine((input) => input.start <= input.end, { message: 'start must not be after end' })
  // The same clamp resolvePeriod puts on a URL range. Without it this boundary
  // was wider than the one the UI can produce: fillPeriodData walks the period
  // day by day against the Graph API, so a decade-wide window handed straight
  // to the action fans out to thousands of calls on the agency's quota.
  .refine((input) => dayCount(input.start, input.end) <= CUSTOM_MAX_DAYS, {
    message: `a reporting period may not exceed ${CUSTOM_MAX_DAYS} days`,
  })

// z.input, not z.infer: `network` carries a default, so it is optional for callers and
// guaranteed present after parsing — the two sides of the same schema.
export type ArchiveReportInput = z.input<typeof archiveReportInputSchema>
