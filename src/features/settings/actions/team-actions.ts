'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { resolveActionAuth, verifyAdminRole } from '@/lib/auth/helpers'
import { USER_RECORD_TAG } from '@/lib/auth/session'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Removes a member from the workspace and deletes their account.
 *
 * A hard delete: the `users` row goes, then the Supabase auth identity. Safe because `users`
 * carries a single `agency_id`, so nobody belongs to a second workspace this would break.
 *
 * Guarded four ways — caller must be an admin, the target must be in the caller's own agency,
 * an admin cannot remove themselves, and the last remaining admin cannot be removed (which would
 * leave the workspace with nobody able to manage it).
 */
export async function removeTeamMember(userId: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId, userId: actorId } = auth

  if (!(await verifyAdminRole(supabase, actorId))) {
    return { ok: false, error: 'Only admins can remove team members' }
  }
  if (userId === actorId) {
    return { ok: false, error: 'You cannot remove yourself' }
  }

  const admin = createAdminSupabaseClient()

  const { data: target } = await admin
    .from('users')
    .select('id, role, agency_id')
    .eq('id', userId)
    .maybeSingle()

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

  const { error: rowError } = await admin.from('users').delete().eq('id', userId)
  if (rowError) {
    console.error(`[team:remove] failed to delete user row ${userId}:`, rowError.message)
    return { ok: false, error: 'Could not remove the member' }
  }

  // Access is already gone at this point; a failure here leaves an orphaned auth identity that
  // belongs to no workspace, which is worth logging but not worth failing the action over.
  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  if (authError) {
    console.error(`[team:remove] user row deleted but auth account remains for ${userId}:`, authError.message)
  }

  // The removed member's agency and role are cached for five minutes; without this their session
  // would keep resolving to a workspace they no longer belong to until the entry expired.
  revalidateTag(USER_RECORD_TAG, 'max')
  revalidatePath('/settings')
  return { ok: true, data: undefined }
}
