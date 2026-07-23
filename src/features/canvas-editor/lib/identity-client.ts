import type { SeedIdentity } from '@/lib/canvas/seed-doc'

/** Fetch a client's palette + brand style for doc seeding — the one client-side identity fetch
 *  (editor open for drafts, wizard auto-compose). */
export async function fetchClientIdentity(clientId: string): Promise<SeedIdentity> {
  const res = await fetch(`/api/clients/${clientId}/visual-identity`)
  const body = (await res.json()) as { identity?: SeedIdentity; error?: string }
  if (!res.ok || !body.identity) throw new Error(body.error ?? 'Failed to load brand identity')
  return body.identity
}
