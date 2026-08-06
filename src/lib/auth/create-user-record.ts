import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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

  // New signup — create agency
  const businessName = meta.businessName ?? 'My Business'
  const mode = meta.mode ?? 'agency'

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
    const { data: clientData, error: clientError } = await admin
      .from('clients')
      .insert({ agency_id: agencyId, name: businessName })
      .select('id')
      .single()

    if (clientError || !clientData) {
      throw new Error(`solo client insert failed: ${clientError?.message ?? 'no row returned'}`)
    }

    const clientId = (clientData as { id: string }).id
    const [{ error: profileError }, { error: scheduleError }] = await Promise.all([
      admin.from('brand_profiles').insert({ client_id: clientId }),
      admin.from('posting_schedules').insert({ client_id: clientId }),
    ])
    if (profileError) throw new Error(`brand profile insert failed: ${profileError.message}`)
    if (scheduleError) throw new Error(`posting schedule insert failed: ${scheduleError.message}`)
  }

  return { agencyId, isInvited: false }
}
