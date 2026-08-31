import { NextResponse } from 'next/server'
import { resolveAuth } from '@/lib/auth/resolve-auth'
import { fetchVisualIdentityOrDefault } from '@/lib/visual/queries'
import { toSeedIdentity } from '@/lib/visual/identity-schema'
import { fetchClientWithOwnership } from '@/lib/auth/helpers'

/** The client's visual identity (palette + brand style) — seeds draft canvas docs in the wizard. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveAuth()
  if (!auth.ok) return auth.response

  // `name` rides along on the row this lookup already fetches for the agency check — the `quote`
  // lockup signs its pull-quote with it, and without it that layout prints a placeholder. Through
  // the shared helper: this was a hand-copied version of it, and it missed the fix that taught the
  // original to tell a missing row from an unreachable database.
  const client = await fetchClientWithOwnership(auth.supabase, id, auth.agencyId)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const identity = await fetchVisualIdentityOrDefault(id)
  return NextResponse.json({ identity: toSeedIdentity(identity, client.name) })
}
