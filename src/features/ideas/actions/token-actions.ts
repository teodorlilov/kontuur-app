'use server'

import { resolveActionAuth, verifyClientOwnership } from '@/lib/auth/helpers'
import { getOrCreateToken } from '@/features/ideas/lib/ideas'
import type { ActionResult } from '@/lib/actions/types'

/**
 * Returns the client's idea-form token, creating one on first use.
 *
 * Deliberately an action rather than something the settings page resolves: `getOrCreateToken`
 * inserts, and a Server Component must not write during render. The page reads with
 * `fetchTokenByClient` and only calls this when the user asks for a link.
 */
export async function ensureIdeaToken(clientId: string): Promise<ActionResult<string>> {
  const auth = await resolveActionAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { supabase, agencyId } = auth

  const owned = await verifyClientOwnership(supabase, clientId, agencyId)
  if (!owned) return { ok: false, error: 'Not found' }

  try {
    const token = await getOrCreateToken(agencyId, clientId)
    return { ok: true, data: token }
  } catch (err) {
    console.error(`[ideas:ensureToken] failed for client ${clientId}:`, err)
    return { ok: false, error: 'Could not create the idea link' }
  }
}
