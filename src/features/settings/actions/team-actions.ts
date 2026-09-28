'use server'

import 'server-only'
import { revalidatePath, revalidateTag } from 'next/cache'
import { resolveActionAuth, verifyAdminRole } from '@/lib/auth/helpers'
import { USER_RECORD_TAG } from '@/lib/auth/session'
import { deleteAuthIdentity } from '@/lib/auth/delete-auth-identity'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { removeTeamMemberSchema } from '@/features/settings/schemas'
import type { ActionResult } from '@/lib/actions/types'

/** What a removal says when the member is gone from the workspace but their login is not. */
const LOGIN_SURVIVED =
  'They were removed from the workspace, but their login could not be deleted. Contact support to finish removing it.'

/**
 * Removes a member from the workspace and hard-deletes their account — safe only because `users`
 * carries one `agency_id`. Admins only, members of the caller's agency only, never oneself or the
 * last admin; a failed lookup answers "could not remove", never "not found". Deletes in reference
 * order: `social_connections` by `user_id` (explicit where migration 20260856's cascade has not
 * landed; a client's connection keys on `client_id` and stays), their invites (a pending one would
 * join the login back), the `users` row, then the login (`deleteAuthIdentity`). The cached agency
 * and role are busted before answering; a surviving login still answers ok, with `LOGIN_SURVIVED`.
 */
export async function removeTeamMember(
  userId: string
): Promise<ActionResult<{ notice: string | null }>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId, userId: actorId } = auth

  if (!(await verifyAdminRole(supabase, actorId))) {
    return { ok: false, error: 'Only admins can remove team members' }
  }
  if (!removeTeamMemberSchema.safeParse(userId).success) {
    return { ok: false, error: 'Member not found' }
  }
  if (userId === actorId) {
    return { ok: false, error: 'You cannot remove yourself' }
  }

  const admin = createAdminSupabaseClient()

  const { data: target, error: targetError } = await admin
    .from('users')
    .select('id, role, agency_id')
    .eq('id', userId)
    .maybeSingle()
  if (targetError) {
    console.error(`[team:remove] target lookup failed for ${userId}:`, targetError.message)
    return { ok: false, error: 'Could not remove the member' }
  }

  if (!target || target.agency_id !== agencyId) {
    return { ok: false, error: 'Member not found' }
  }

  if (target.role === 'admin') {
    const { count } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', agencyId)
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      return { ok: false, error: 'The workspace must keep at least one admin' }
    }
  }

  const { error: connectionError } = await admin
    .from('social_connections')
    .delete()
    .eq('user_id', userId)
  if (connectionError) {
    console.error(
      `[team:remove] failed to remove connections for ${userId}:`,
      connectionError.message
    )
    return { ok: false, error: 'Could not remove the member' }
  }

  const { error: inviteError } = await admin
    .from('team_invites')
    .delete()
    .eq('auth_user_id', userId)
  if (inviteError) {
    console.error(`[team:remove] failed to remove invites for ${userId}:`, inviteError.message)
    return { ok: false, error: 'Could not remove the member' }
  }

  const { error: rowError } = await admin.from('users').delete().eq('id', userId)
  if (rowError) {
    console.error(`[team:remove] failed to delete user row ${userId}:`, rowError.message)
    return { ok: false, error: 'Could not remove the member' }
  }

  const loginDeleted = await deleteAuthIdentity(admin, userId, 'team:remove')
  revalidateTag(USER_RECORD_TAG, 'max')
  revalidatePath('/settings')
  return { ok: true, data: { notice: loginDeleted ? null : LOGIN_SURVIVED } }
}
