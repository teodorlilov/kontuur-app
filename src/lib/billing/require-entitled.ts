import 'server-only'

import { NextResponse } from 'next/server'
import { getCachedEntitlement } from '@/lib/queries/cache'
import type { ActionResult } from '@/lib/actions/types'
import { allows, type Entitlement, type EntitlementNeed } from './entitlement'
import { WORKSPACE_LOCKED, cannotSpendNotice } from './copy'

/**
 * The one gate pair every cost-bearing route and action calls, one line after its auth — the
 * same shapes as `aiRateLimitResponse` (a response or null) and `ActionResult` (a failure or
 * null), so a call site reads like the limiter beside it. Deliberately NOT attached to the auth
 * funnels: read paths stay open so a paused customer keeps their data readable, and the
 * gate-coverage test is what makes "each spending site must remember" safe.
 *
 * `need` names what the site is about to do: spend money (creating a brand among it) or publish
 * to a network. Which states allow which is `entitlementFor`'s decision, not this file's. Both answer a
 * refusal with its sentence alone — for the route, the `{ error }` body every client reads
 * (`readErrorMessage`, src/utils/read-error-message.ts) — since `cannotSpendNotice`
 * (src/lib/billing/copy.ts) already words the trial's grace apart from a paused workspace.
 */

/**
 * The sentence a refusal carries: `cannotSpendNotice`'s, so a 402 says what the wall and the
 * banner say. `entitlementFor` never lets a workspace spend without also letting it publish, so a
 * refused need always means it cannot spend and the notice is always there.
 */
function refusalOf(entitlement: Entitlement): string {
  return cannotSpendNotice(entitlement)?.text ?? WORKSPACE_LOCKED
}

/** A 402 carrying the refusal's sentence, or null when the need is allowed. */
export async function requireEntitledRoute(
  agencyId: string,
  need: EntitlementNeed
): Promise<NextResponse | null> {
  const entitlement = await getCachedEntitlement(agencyId)
  if (allows(entitlement, need)) return null
  return NextResponse.json({ error: refusalOf(entitlement) }, { status: 402 })
}

/** The action-shaped refusal, or null when the need is allowed. */
export async function requireEntitledAction(
  agencyId: string,
  need: EntitlementNeed
): Promise<Extract<ActionResult, { ok: false }> | null> {
  const entitlement = await getCachedEntitlement(agencyId)
  if (allows(entitlement, need)) return null
  return { ok: false, error: refusalOf(entitlement) }
}
