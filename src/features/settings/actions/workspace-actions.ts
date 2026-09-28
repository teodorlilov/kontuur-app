'use server'

import 'server-only'
import { revalidateTag } from 'next/cache'
import { resolveActionAuth, verifyAdminRole, USER_RECORD_TAG } from '@/lib/auth/helpers'
import { deleteAuthIdentity } from '@/lib/auth/delete-auth-identity'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { sweepClientStorage } from '@/lib/clients/sweep-client-storage'
import { fetchAgencyById, fetchTeamMembersByAgency } from '@/lib/queries/db'
import { getCachedAgencyClients, revalidateClientData } from '@/lib/queries/cache'
import { entitlementFor } from '@/lib/billing/entitlement'
import { DELETE_ADMINS_ONLY, deleteWorkspaceRefusal } from '@/lib/billing/copy'
import { deleteWorkspaceSchema } from '@/features/settings/schemas'
import { normalizeForCompare } from '@/utils/format'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Permanently delete the caller's workspace, every login in it and its storage: `agencies`
 * cascades the rows (migration 20260856), leaving the Н-18 records (`sale_documents`,
 * `billing_events`) and the billing-documents bucket. The workspace is never an argument, the
 * admin check is a fresh read, an open plan not yet set to end refuses (`deleteWorkspaceRefusal`)
 * — one set to end runs out afterwards, the webhook recording its last events with no owner — and
 * the typed name is re-checked, so the dialog is not the only gate.
 *
 * Pending invites are deleted, returning their logins, right before the workspace, never read
 * ahead of it: an invite recorded after a read would cascade away and leave its login. One
 * `inviteMember` records between the two deletes still cascades and keeps its login, unless its
 * re-read after the send (`isClaimStanding`, src/features/settings/lib/invite-member.ts) finds the
 * row gone first. The deleted invites' logins go even if
 * the workspace delete fails, their rows being gone. Never sign out, write a cookie, call
 * `revalidatePath` or bust with `{ expire: 0 }`: `/settings` would re-render for a deleted
 * workspace, racing the dialog's navigation to `GOODBYE_PATH`.
 */
export async function deleteWorkspace(confirmName: string): Promise<ActionResult> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId, userId } = auth

  if (!(await verifyAdminRole(supabase, userId))) return { ok: false, error: DELETE_ADMINS_ONLY }

  const parsed = deleteWorkspaceSchema.safeParse(confirmName)
  if (!parsed.success) return { ok: false, error: 'The name does not match.' }

  const agency = await fetchAgencyById(supabase, agencyId)
  if (!agency) return { ok: false, error: 'Workspace not found' }

  const refused = deleteWorkspaceRefusal(entitlementFor(agency, new Date()))
  if (refused) return { ok: false, error: refused }
  if (normalizeForCompare(parsed.data) !== normalizeForCompare(agency.name)) {
    return { ok: false, error: 'The name does not match.' }
  }

  const [clients, members] = await Promise.all([
    getCachedAgencyClients(agencyId),
    fetchTeamMembersByAgency(agencyId),
  ])
  console.warn(
    `[workspace:delete] deleting "${agency.name}" (${agencyId}) by ${userId} — ` +
      `${clients.length} clients, ${members.length} members`
  )

  const admin = createAdminSupabaseClient()
  const invites = await admin
    .from('team_invites')
    .delete()
    .eq('agency_id', agencyId)
    .is('accepted_at', null)
    .select('auth_user_id')
  if (invites.error) {
    console.error(
      `[workspace:delete] pending invites delete failed for ${agencyId}:`,
      invites.error.message
    )
    return { ok: false, error: 'Could not delete the workspace. Please try again.' }
  }

  const { error } = await admin.from('agencies').delete().eq('id', agencyId)
  for (const invite of invites.data ?? []) {
    await deleteAuthIdentity(admin, invite.auth_user_id, 'workspace:delete')
  }
  if (error) {
    console.error(`[workspace:delete] failed for ${agencyId}:`, error.message)
    if (error.code === '23503') {
      return { ok: false, error: 'Cannot delete: the database is missing migration 20260856.' }
    }
    return { ok: false, error: 'Could not delete the workspace. Please try again.' }
  }

  for (const member of members) await deleteAuthIdentity(admin, member.id, 'workspace:delete')
  const swept = await Promise.all(clients.map((client) => sweepClientStorage(client.id)))
  console.warn(
    `[workspace:delete] removed "${agency.name}" (${agencyId}) — ` +
      `${swept.reduce((n, s) => n + s.images, 0)} images, ${swept.reduce((n, s) => n + s.files, 0)} files`
  )

  revalidateTag(USER_RECORD_TAG, 'max')
  revalidateTag('agencies', 'max')
  revalidateClientData()
  return { ok: true, data: undefined }
}
