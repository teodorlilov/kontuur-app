import { z } from 'zod'
import { isSupportedTimezone } from '@/lib/timezones'

/**
 * Server-action arg: the member being removed.
 *
 * Validated even though `removeTeamMember` also checks admin role and agency
 * ownership — those checks run against the value, so the value has to be the
 * right shape before they mean anything.
 */
export const removeTeamMemberSchema = z.uuid()

/**
 * Route-handler body for PUT /api/settings/account.
 *
 * `timezone` is checked against the picker's list rather than accepted as any
 * string: the generate cron feeds this value to `Intl.DateTimeFormat` to decide
 * whose slot is due, and an unknown zone throws there — where it would fail the
 * whole tick, not just this agency.
 *
 * `.trim()` on the name means the parsed value is the stored value.
 */
export const accountSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Agency name cannot be empty').optional(),
  timezone: z.string().refine(isSupportedTimezone, 'Unsupported timezone').optional(),
})
