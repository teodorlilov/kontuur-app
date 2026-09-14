import { redirect } from 'next/navigation'

/**
 * A solo workspace with no client has not set up its business yet, and is sent to the onboarding
 * flow at /clients/new before anything else renders — while the workspace may still create one.
 *
 * Derived from state, not a stored flag: a `clients` row is created only by `createClient`
 * (src/features/clients/actions/client-actions.ts), so "a client exists" is "setup completed", and
 * an interrupted setup resumes on the next login. Agency workspaces never redirect — their
 * zero-client state is a real screen. Called from src/app/(dashboard)/layout.tsx and
 * src/app/(generate)/generate/page.tsx; never from the (onboarding) route group, which is the
 * destination — the destination must not redirect back, or a stale roster becomes a loop.
 *
 * `canCreate` is the other half of that rule: a lapsed workspace is sent by the (onboarding)
 * layout to Plan & billing, which renders under the (dashboard) layout that calls this, so a
 * redirect from here would bounce it between the two forever. It stays where it is and sees the
 * wall instead.
 */
export function requireBusinessSetup(
  mode: string | null | undefined,
  clientCount: number,
  canCreate: boolean
): void {
  if (mode === 'solo' && clientCount === 0 && canCreate) redirect('/clients/new')
}
