import { z } from 'zod'
import { CUSTOM_MAX_DAYS, DATE_KEY_PATTERN, dayCount, RANGE_PRESETS } from './lib/compute/period'

/**
 * Input for archiving the currently displayed period into analytics_reports.
 *
 * `network` carries a default because `AudienceCapture` sends no network field at all.
 *
 * The day-count refine is the same clamp `resolvePeriod` puts on a URL range: `fillPeriodData`
 * turns whatever window it is handed into chunked Graph series calls with no cap on that loop,
 * so a window wider than the UI can produce would spend the account's quota on it.
 */
export const archiveReportInputSchema = z
  .object({
    clientId: z.string().uuid(),
    preset: z.enum([...RANGE_PRESETS, 'custom']),
    start: z.string().regex(DATE_KEY_PATTERN),
    end: z.string().regex(DATE_KEY_PATTERN),
    network: z.enum(['instagram', 'facebook']).default('instagram'),
  })
  .refine((input) => input.start <= input.end, { message: 'start must not be after end' })
  .refine((input) => dayCount(input.start, input.end) <= CUSTOM_MAX_DAYS, {
    message: `a reporting period may not exceed ${CUSTOM_MAX_DAYS} days`,
  })

// z.input, not z.infer: `network` carries a default, so it is optional for callers and
// guaranteed present after parsing.
export type ArchiveReportInput = z.input<typeof archiveReportInputSchema>
