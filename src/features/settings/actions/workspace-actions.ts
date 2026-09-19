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
 * Permanently delete the caller's workspace: every client and everything under it, every
 * member and their account, the storage they used. One row is deleted here — `agencies` — and
 * migration 20260856 cascades the rest in the same transaction, so there is no half-deleted
 * workspace and no table list to keep in step. What survives, by design: `sale_documents` and
 * `billing_events` with no owner (the Н-18 records), and the billing-documents bucket.
 *
 * The workspace is the caller's own, never an argument; the admin check is the fresh read, not
 * the cached role, for the most destructive action in the product. A live subscription refuses
 * (`deleteWorkspaceRefusal`) — the plan is ended in Stripe's portal first, and the subscription
 * then runs out on its own; the webhook records its last events with no owner. The typed name is
 * re-checked here so the dialog's gate is not the only one.
 *
 * Order after the row: the auth identities (the actor's included — `fetchTeamMembersByAgency`
 * lists everyone), then the storage sweep, then the caches, and every bust with `'max'`. This
 * action must never sign out, write a cookie, call `revalidatePath` or bust with `{ expire: 0 }`:
 * any of those marks the response "revalidated" and the router re-renders `/settings` for a
 * workspace that no longer exists, racing the dialog's own navigation to `GOODBYE_PATH`. The
 * session ends on that page instead (features/auth/components/goodbye-sign-out.tsx).
 *
 * Invitees who never accepted are not reached — they exist only as auth users with
 * `invited_agency_id` metadata and nothing here lists auth users; their first visit fails at
 * `createUserRecord`'s invited branch.
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
  const { error } = await admin.from('agencies').delete().eq('id', agencyId)
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
