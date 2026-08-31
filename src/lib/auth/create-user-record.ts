import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { provisionClient } from '@/features/clients/lib/provision-client'

/**
 * What signup metadata must say before any of it reaches a column.
 *
 * `mode` decides whether the account gets a solo client and lands in `agencies.mode`, so an
 * unrecognised value has to be refused rather than stored. This schema lived in the signup route,
 * which meant the OTHER path into this function — the auth callback, reading the same two values
 * out of `user_metadata` through an `as` cast — stored whatever was there.
 */
const accountMetadataSchema = z.object({
  businessName: z.string().trim().min(1),
  mode: z.enum(['agency', 'solo']).default('agency'),
})

type AdminClient = SupabaseClient<Database>

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
 * Create a user record (and optionally an agency) from auth metadata.
 * Used by both the auth callback and the dashboard layout fallback.
 *
 * - Invited users: inserts into existing agency with 'member' role.
 * - New signups: creates agency, inserts user as 'admin', creates
 *   default client/brand-profile/schedule for solo mode.
 *
 * Idempotent: a second call for a user who already has a row returns that row's agency and writes
 * nothing. Without this guard the new-signup path creates the agency *before* inserting the user,
 * so a repeat call left an orphaned agency (plus, in solo mode, a client, brand profile and
 * schedule) behind every time — and both callers can re-run for the same user.
 *
 * Throws if any write fails. A half-created account renders as a signed-in user with a broken
 * dashboard, so the failure has to surface rather than be reported as a successful signup.
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
    return { agencyId: (existing as { agency_id: string }).agency_id, isInvited: false }
  }

  const meta = user.user_metadata as {
    businessName?: string
    mode?: 'agency' | 'solo'
    invited_agency_id?: string
    role?: string
  }

  // Invited user — join existing agency
  if (meta.invited_agency_id) {
    const { error } = await admin.from('users').insert({
      id: user.id,
      agency_id: meta.invited_agency_id,
      email: user.email,
      role: meta.role ?? 'member',
    })
    if (error) throw new Error(`invited-user insert failed: ${error.message}`)
    return { agencyId: meta.invited_agency_id, isInvited: true }
  }

  // New signup — create agency.
  //
  // Validated, not defaulted. This read `meta.businessName ?? 'My Business'`, so a signup whose
  // metadata was missing or malformed silently created an agency called "My Business" — while the
  // signup route, which the same browser call also hits, refused an empty name outright. Two
  // answers to one question, decided by whichever path ran first.
  const parsed = accountMetadataSchema.safeParse(meta)
  if (!parsed.success) throw new Error('signup metadata is missing a business name or mode')
  const { businessName, mode } = parsed.data

  // `users.email` is a lookup key — forgot-password finds accounts by it — so an empty one is an
  // account nobody can recover. The signup route wrote `user.email ?? ''` here; failing the signup
  // is the better outcome, and the caller reports it.
  if (!user.email) throw new Error('cannot create a user record without an email')

  const { data: agencyData, error: agencyError } = await admin
    .from('agencies')
    .insert({ name: businessName, mode })
    .select('id')
    .single()

  if (agencyError || !agencyData) {
    throw new Error(`agency insert failed: ${agencyError?.message ?? 'no row returned'}`)
  }

  const agencyId = (agencyData as { id: string }).id

  const { error: userError } = await admin.from('users').insert({
    id: user.id,
    agency_id: agencyId,
    email: user.email,
    role: 'admin',
  })
  if (userError) throw new Error(`user insert failed: ${userError.message}`)

  if (mode === 'solo') {
    // The same provisioner the onboarding form uses. This path used to build the client by hand
    // and had drifted three ways from it: no visual identity, no web-research row, no rollback.
    const provisioned = await provisionClient(admin, { agencyId, name: businessName })
    if (!provisioned.ok) throw new Error(`solo client provisioning failed: ${provisioned.error}`)
  }

  return { agencyId, isInvited: false }
}
