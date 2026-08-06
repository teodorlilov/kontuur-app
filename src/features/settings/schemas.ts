import { z } from 'zod'

/**
 * Server-action arg: the member being removed.
 *
 * Validated even though `removeTeamMember` also checks admin role and agency
 * ownership — those checks run against the value, so the value has to be the
 * right shape before they mean anything.
 */
export const removeTeamMemberSchema = z.uuid()
