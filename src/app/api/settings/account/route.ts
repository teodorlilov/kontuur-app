import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { verifyAdminRole } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { accountSettingsSchema } from '@/features/settings/schemas'
import { formatZodIssues } from '@/lib/validation/format-issues'

/**
 * Update the agency's account settings — its name and timezone. Admin only: the role is read
 * fresh (`verifyAdminRole`) and the body allowlisted by `accountSettingsSchema`, then the write
 * goes through the admin client, because the tenant role holds no update on these columns
 * (migration 20260862 revokes it — a member could otherwise rename the workspace from the browser).
 * The cached agency is expired at once with `{ expire: 0 }`: the account tab's `router.refresh()`
 * (src/features/settings/components/account-tab.tsx) re-renders the shell from `getCachedAgency`
 * (src/lib/queries/cache.ts), and 'max' would serve it the old name and timezone once more.
 */
export async function PUT(request: Request) {
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response
  const { supabase, agencyId, userId } = auth

  const isAdmin = await verifyAdminRole(supabase, userId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Only admins can update account settings' }, { status: 403 })
  }

  let body: z.infer<typeof accountSettingsSchema>
  try {
    body = accountSettingsSchema.parse(await request.json())
  } catch (err) {
    const reason =
      err instanceof z.ZodError ? formatZodIssues(err).join('; ') : 'Invalid request body'
    return NextResponse.json({ error: reason }, { status: 400 })
  }

  const updates: typeof body = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.timezone !== undefined) updates.timezone = body.timezone

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await createAdminSupabaseClient()
    .from('agencies')
    .update(updates)
    .eq('id', agencyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateTag('agencies', { expire: 0 })
  return NextResponse.json({ success: true })
}
