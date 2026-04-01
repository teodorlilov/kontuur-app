import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireAuth, AuthError, type SupabaseServerClient } from '@/lib/auth/helpers'

export interface AuthContext {
  supabase: SupabaseServerClient
  agencyId: string
  userId: string
}

type AuthSuccess = { ok: true } & AuthContext
type AuthFailure = { ok: false; response: NextResponse }
type AuthResult = AuthSuccess | AuthFailure

/**
 * Resolve authentication for an API route.
 * Returns the auth context on success, or a ready-to-return error response on failure.
 *
 * Usage:
 *   const auth = await resolveAuth()
 *   if (!auth.ok) return auth.response
 *   const { supabase, agencyId } = auth
 */
export async function resolveAuth(): Promise<AuthResult> {
  const supabase = await createServerSupabaseClient()
  try {
    const { agencyId, userId } = await requireAuth(supabase)
    return { ok: true, supabase, agencyId, userId }
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, response: NextResponse.json({ error: err.message }, { status: err.statusCode }) }
    }
    return { ok: false, response: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}
