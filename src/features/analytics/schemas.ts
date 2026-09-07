import { z } from 'zod'
import { CUSTOM_MAX_DAYS, DATE_KEY_PATTERN, dayCount, RANGE_PRESETS } from './lib/compute/period'

/** Input for archiving the currently displayed period into analytics_reports. */
export const archiveReportInputSchema = z
  .object({
    clientId: z.string().uuid(),
    preset: z.enum([...RANGE_PRESETS, 'custom']),
    start: z.string().regex(DATE_KEY_PATTERN),
    end: z.string().regex(DATE_KEY_PATTERN),
    // Optional, defaulting to Instagram: `AudienceCapture` still sends no network at all.
    network: z.enum(['instagram', 'facebook']).default('instagram'),
  })
  .refine((input) => input.start <= input.end, { message: 'start must not be after end' })
  // The same clamp `resolvePeriod` puts on a URL range, so the action boundary is never
  // wider than the one the UI can produce. `fillPeriodData` chunks the whole window into
  // Graph calls with no cap on the series loop, so window width sets the call count.
  .refine((input) => dayCount(input.start, input.end) <= CUSTOM_MAX_DAYS, {
    message: `a reporting period may not exceed ${CUSTOM_MAX_DAYS} days`,
  })

// z.input, not z.infer: `network` carries a default, so it is optional for callers and
// guaranteed present after parsing.
export type ArchiveReportInput = z.input<typeof archiveReportInputSchema>
