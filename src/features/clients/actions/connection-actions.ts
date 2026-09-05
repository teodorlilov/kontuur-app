'use server'

import { revalidateTag } from 'next/cache'
import { resolveActionAuth } from '@/lib/auth/helpers'
import { parseActionId } from '@/lib/actions/parse-input'
import type { ActionResult } from '@/lib/actions/types'
import { z } from 'zod'
import { verifyClientOwnership } from '@/lib/auth/helpers'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { storeConnection } from '@/lib/meta/connection-store'
import { fetchFacebookPages, type FacebookPage } from '@/lib/meta/facebook-auth'
import { FACEBOOK_USER_PLATFORM } from '@/lib/meta/oauth-networks'

/** A Page id is Facebook's, so it is digits — never a uuid, which parseActionId would demand. */
const facebookPageIdSchema = z.string().regex(/^\d{1,32}$/)

/** Disconnect a social connection by ID. */
export async function disconnectConnection(connectionId: string): Promise<ActionResult> {
  const parsed = parseActionId(connectionId, 'connectionId')
  if (!parsed.ok) return parsed.result

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  // Verify the connection belongs to a client owned by this agency
  const { data: connection } = (await supabase
    .from('social_connections')
    .select('id, client_id, clients!inner(agency_id)')
    .eq('id', connectionId)
    .single()) as { data: (Record<string, unknown> & { clients: { agency_id: string } }) | null }

  if (!connection || connection.clients.agency_id !== agencyId) {
    return { ok: false, error: 'Not found' }
  }

  const { error } = await supabase.from('social_connections').delete().eq('id', connectionId)
  if (error) return { ok: false, error: error.message }

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: undefined }
}

/**
 * The Pages the signed-in user's Facebook token can reach.
 *
 * Read live from Graph rather than stored: a Page the person has since lost access to must stop
 * being offered, and the list is only ever looked at during the seconds a chooser is open.
 *
 * The user-scoped token has a NULL `client_id`, which puts it outside RLS — so it is read with
 * the admin client, filtered by the signed-in user's own id and the platform. Both filters are
 * load-bearing: without the user filter this would read whichever token came back first.
 */
export async function listFacebookPages(): Promise<ActionResult<FacebookPage[]>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('social_connections')
    .select('access_token')
    .eq('user_id', auth.userId)
    .eq('platform', FACEBOOK_USER_PLATFORM)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }

  const token = (data as { access_token: string | null } | null)?.access_token
  if (!token) return { ok: false, error: 'Connect Facebook first' }

  try {
    return { ok: true, data: await fetchFacebookPages(token) }
  } catch (err) {
    console.error('[connections] facebook page list failed:', err)
    return { ok: false, error: 'Could not read your Facebook Pages' }
  }
}

/**
 * Connect one Page to one client — the second half of the Facebook flow.
 *
 * The Page token is taken from the live list, never from the browser: a page id is a request,
 * and honouring a token sent alongside it would let a caller attach any credential they liked
 * to a client they own.
 */
export async function connectFacebookPage(clientId: string, pageId: string): Promise<ActionResult> {
  const parsedClient = parseActionId(clientId, 'clientId')
  if (!parsedClient.ok) return parsedClient.result
  const parsedPage = facebookPageIdSchema.safeParse(pageId)
  if (!parsedPage.success) return { ok: false, error: 'Invalid page' }

  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const owned = await verifyClientOwnership(auth.supabase, clientId, auth.agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  const pages = await listFacebookPages()
  if (!pages.ok) return pages
  const page = pages.data.find((candidate) => candidate.id === parsedPage.data)
  if (!page) return { ok: false, error: 'That Page is no longer available' }

  await storeConnection(createAdminSupabaseClient(), {
    clientId,
    platform: 'facebook',
    accountId: page.id,
    accountName: page.name,
    accessToken: page.accessToken,
    // A Page token derived from a long-lived user token carries no expiry — see
    // docs/META-FB-PROBE.md, where /me/accounts returns no expiry field at all.
    tokenExpiresAt: null,
  })

  revalidateTag('agency-clients', 'max')
  return { ok: true, data: undefined }
}
