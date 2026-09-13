import 'server-only'

import { NextResponse } from 'next/server'
import { getCachedEntitlement } from '@/lib/queries/cache'
import type { ActionResult } from '@/lib/actions/types'
import type { Entitlement, EntitlementState } from './entitlement'
import { WORKSPACE_LOCKED } from './copy'

/**
 * The one gate pair every cost-bearing route and action calls, one line after its auth — the
 * same shapes as `aiRateLimitResponse` (a response or null) and `ActionResult` (a failure or
 * null), so a call site reads like the limiter beside it. Deliberately NOT attached to the auth
 * funnels: read paths stay open so a paused customer keeps their data readable, and the
 * gate-coverage test is what makes "each spending site must remember" safe.
 *
 * `need` names what the site is about to do: spend money, publish to a network, or create a
 * brand. Which states allow which is `entitlementFor`'s decision, not this file's.
 */
export type EntitlementNeed = 'spend' | 'publish' | 'create'

function allows(entitlement: Entitlement, need: EntitlementNeed): boolean {
  return need === 'spend'
    ? entitlement.canSpend
    : need === 'publish'
      ? entitlement.canPublish
      : entitlement.canCreate
}

function reasonFor(state: EntitlementState): string {
  return state === 'trial_grace' ? 'trial_ended' : state
}

/** A 402 with the workspace's state, or null when the need is allowed. */
export async function requireEntitledRoute(
  agencyId: string,
  need: EntitlementNeed
): Promise<NextResponse | null> {
  const entitlement = await getCachedEntitlement(agencyId)
  if (allows(entitlement, need)) return null
  return NextResponse.json(
    { error: WORKSPACE_LOCKED, code: 'locked', reason: reasonFor(entitlement.state) },
    { status: 402 }
  )
}

/** The action-shaped refusal, or null when the need is allowed. */
export async function requireEntitledAction(
  agencyId: string,
  need: EntitlementNeed
): Promise<Extract<ActionResult, { ok: false }> | null> {
  const entitlement = await getCachedEntitlement(agencyId)
  if (allows(entitlement, need)) return null
  return { ok: false, error: WORKSPACE_LOCKED }
}
