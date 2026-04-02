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
 * Returns null if agency creation fails.
 */
export async function createUserRecord(
  admin: AdminClient,
  user: UserInput
): Promise<CreateUserRecordResult | null> {
  const meta = user.user_metadata as {
    businessName?: string
    mode?: 'agency' | 'solo'
    invited_agency_id?: string
    role?: string
  }

  // Invited user — join existing agency
  if (meta.invited_agency_id) {
    await admin.from('users').insert({
      id: user.id,
      agency_id: meta.invited_agency_id,
      email: user.email,
      role: meta.role ?? 'member',
    })
    return { agencyId: meta.invited_agency_id, isInvited: true }
  }

  // New signup — create agency
  const businessName = meta.businessName ?? 'My Business'
  const mode = meta.mode ?? 'agency'

  const { data: agencyData } = await admin
    .from('agencies')
    .insert({ name: businessName, mode })
    .select('id')
    .single()

  if (!agencyData) return null

  const agencyId = (agencyData as { id: string }).id

  await admin.from('users').insert({
    id: user.id,
    agency_id: agencyId,
    email: user.email,
    role: 'admin',
  })

  if (mode === 'solo') {
    const { data: clientData } = await admin
      .from('clients')
      .insert({ agency_id: agencyId, name: businessName })
      .select('id')
      .single()

    if (clientData) {
      const clientId = (clientData as { id: string }).id
      await admin.from('brand_profiles').insert({ client_id: clientId })
      await admin.from('posting_schedules').insert({ client_id: clientId })
    }
  }

  return { agencyId, isInvited: false }
}
