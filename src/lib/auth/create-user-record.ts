import { z } from 'zod'
import { TRIAL_DAYS } from '@/lib/billing/plans'
import type { AdminClient } from '@/lib/supabase/admin'
import { MS_PER_DAY } from '@/utils/constants'

/**
 * What signup metadata must say before any of it reaches a column.
 *
 * `mode` lands in `agencies.mode`, which the app shell and the first-run gate
 * (features/onboarding/lib/require-business-setup.ts) read, so an unrecognised value has to be
 * refused rather than stored. Every caller (src/app/api/auth/signup/route.ts,
 * src/app/auth/callback/page.tsx, `provisionUserRecord` in src/lib/auth/provision-user-record.ts)
 * passes `user_metadata` as the login wrote it, so this is the one check it gets.
 */
const accountMetadataSchema = z.object({
  businessName: z.string().trim().min(1),
  mode: z.enum(['agency', 'solo']).default('agency'),
})

interface UserInput {
  id: string
  email: string
  user_metadata: Record<string, unknown>
}

interface CreateUserRecordResult {
  agencyId: string
  isInvited: boolean
}

/**
 * Create the `users` row (and, for a new signup, its agency) for a login with none. Idempotent,
 * since every caller can re-run for one user and a new signup inserts its agency first. A failed
 * read or insert throws: a half-created account is a broken dashboard, not a signup.
 *
 * An invited login joins by its pending `team_invites` row alone (born in `inviteMember`,
 * src/features/settings/lib/invite-member.ts), never by `user_metadata`, which anyone can write.
 * The invite is stamped accepted after the user insert, so a failed insert can try again; a failed
 * stamp is only logged, the membership standing. A new signup needs an email (forgot-password
 * finds accounts by it) and a business name, with a mode of `agency` or `solo` (absent means
 * `agency`), and gets an admin row, no client (onboarding
 * makes the first, `createClient` in src/features/clients/actions/client-actions.ts) and a trial
 * end from `TRIAL_DAYS`, because migration 20260862 drops that column's default.
 */
export async function createUserRecord(
  admin: AdminClient,
  user: UserInput
): Promise<CreateUserRecordResult> {
  const { data: existing, error: existingError } = await admin
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .maybeSingle()
  if (existingError) throw new Error(`user lookup failed: ${existingError.message}`)

  if (existing) {
    return { agencyId: existing.agency_id, isInvited: false }
  }

  const { data: invite, error: inviteError } = await admin
    .from('team_invites')
    .select('id, agency_id, role')
    .eq('auth_user_id', user.id)
    .is('accepted_at', null)
    .maybeSingle()
  if (inviteError) throw new Error(`invite lookup failed: ${inviteError.message}`)

  if (invite) {
    const { error } = await admin.from('users').insert({
      id: user.id,
      agency_id: invite.agency_id,
      email: user.email,
      role: invite.role,
    })
    if (error) throw new Error(`invited-user insert failed: ${error.message}`)
    const { error: acceptError } = await admin
      .from('team_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)
    if (acceptError) {
      console.error(
        `[auth] invite ${invite.id} joined but not stamped accepted:`,
        acceptError.message
      )
    }
    return { agencyId: invite.agency_id, isInvited: true }
  }

  const parsed = accountMetadataSchema.safeParse(user.user_metadata)
  if (!parsed.success) throw new Error('signup metadata is missing a business name or mode')
  const { businessName, mode } = parsed.data

  if (!user.email) throw new Error('cannot create a user record without an email')

  const { data: agencyData, error: agencyError } = await admin
    .from('agencies')
    .insert({
      name: businessName,
      mode,
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * MS_PER_DAY).toISOString(),
    })
    .select('id')
    .single()

  if (agencyError || !agencyData) {
    throw new Error(`agency insert failed: ${agencyError?.message ?? 'no row returned'}`)
  }

  const agencyId = agencyData.id

  const { error: userError } = await admin.from('users').insert({
    id: user.id,
    agency_id: agencyId,
    email: user.email,
    role: 'admin',
  })
  if (userError) throw new Error(`user insert failed: ${userError.message}`)

  return { agencyId, isInvited: false }
}
