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
 * Server-action arg: the workspace name typed back to confirm its deletion. Shape only — whether
 * it matches the stored name is `deleteWorkspace`'s own rule, through `normalizeForCompare`.
 */
export const deleteWorkspaceSchema = z.string().trim().min(1)

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

/** Server-action arg: whether the plan is to end at its period end (true) or be kept (false). */
export const setPlanEndingSchema = z.boolean()

/** Server-action arg: a number of client slots — Checkout's, or either side of a change. */
export const clientSlotsSchema = z.number().int().min(0)

/**
 * Server-action arg: a slot change, from the count the person saw to the one they chose, with the
 * start of the period its confirm was priced on.
 */
export const slotChangeSchema = z.object({
  from: clientSlotsSchema,
  to: clientSlotsSchema,
  periodStart: z.string(),
})

export type SlotChangeInput = z.infer<typeof slotChangeSchema>
