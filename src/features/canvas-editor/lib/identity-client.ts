import type { SeedIdentity } from '@/lib/canvas/seed-doc'
import { parseSeedIdentity } from '@/lib/visual/identity-schema'

/** Fetch the identity to seed docs from — the one client-side identity fetch (editor open for
 *  drafts, wizard auto-compose). Parsed rather than cast, like the canvas route's own reader: the
 *  two answer with the same shape and should be equally sure of it. */
export async function fetchClientIdentity(clientId: string): Promise<SeedIdentity> {
  const res = await fetch(`/api/clients/${clientId}/visual-identity`)
  const body = (await res.json()) as { identity?: unknown; error?: string }
  const identity = parseSeedIdentity(body.identity)
  if (!res.ok || !identity) throw new Error(body.error ?? 'Failed to load brand identity')
  return identity
}
