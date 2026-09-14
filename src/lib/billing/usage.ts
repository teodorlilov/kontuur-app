import 'server-only'

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/notifications/notify'
import type { Entitlement } from './entitlement'
import { getCachedEntitlement } from '@/lib/queries/cache'
import type { Spender } from './spend-context'
import { ALLOWANCE_WARN_SHARE, type Allowance, type AllowanceKind } from './plans'
import { allowanceUsedUp, allowanceWarning } from './copy'

/**
 * The allowance ledger — one atomic counter per (agency, period, kind) in `usage_counters`,
 * moved by the `consume_usage` compare-and-set (migration 20260852), which only increments while
 * count + cost <= quota. Called from the two places spend is born: `startGenerationRun` for
 * drafts and `subscribeFal` for images, plus the rewrite route. Always through the admin client:
 * the RPCs are executable by the service role alone.
 *
 * A refusal is a value, not an exception, so the two chokepoints can decide their own shape; the
 * routes turn one into `allowanceResponse` (402) through `AllowanceError`.
 */

interface ConsumeResult {
  allowed: boolean
  used: number
  quota: number
}

/**
 * Reserve `cost` units of `kind` against the entitlement's period; refused when the quota is zero.
 * The 80 % bell fires on the call that crosses the line and is telemetry: a bell that cannot be
 * written never undoes a reservation that succeeded.
 */
export async function consumeUsage(
  entitlement: Entitlement,
  agencyId: string,
  kind: AllowanceKind,
  cost: number
): Promise<ConsumeResult> {
  const quota = entitlement.limits[kind]
  if (quota <= 0) return { allowed: false, used: 0, quota: 0 }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.rpc('consume_usage', {
    p_agency_id: agencyId,
    p_period: entitlement.periodKey,
    p_kind: kind,
    p_cost: cost,
    p_quota: quota,
  })
  if (error) throw new Error(`consume_usage failed: ${error.message}`)
  const outcome = data?.[0] ?? { allowed: false, used: 0 }

  const line = quota * ALLOWANCE_WARN_SHARE
  if (outcome.allowed && outcome.used >= line && outcome.used - cost < line) {
    try {
      await notify(admin, {
        agencyId,
        type: 'allowance_warning',
        message: allowanceWarning(kind, outcome.used, quota, entitlement),
        cooldownDays: 31,
      })
    } catch (err) {
      console.warn(`[billing] could not record the allowance warning for ${agencyId}:`, err)
    }
  }
  return { allowed: outcome.allowed, used: outcome.used, quota }
}

/** Give back units a reservation did not use — a run that produced fewer drafts, a fal call that threw. */
export async function refundUsage(
  entitlement: Entitlement,
  agencyId: string,
  kind: AllowanceKind,
  cost: number
): Promise<void> {
  if (cost <= 0) return
  const { error } = await createAdminSupabaseClient().rpc('refund_usage', {
    p_agency_id: agencyId,
    p_period: entitlement.periodKey,
    p_kind: kind,
    p_cost: cost,
  })
  if (error) console.error(`[billing] refund_usage failed for ${agencyId}/${kind}:`, error.message)
}

/** What the workspace has used this period, by kind — zero for a kind with no row yet. */
export async function readUsage(agencyId: string, periodKey: string): Promise<Allowance> {
  const { data, error } = await createAdminSupabaseClient()
    .from('usage_counters')
    .select('kind, count')
    .eq('agency_id', agencyId)
    .eq('period', periodKey)
  if (error) throw new Error(`usage_counters read failed: ${error.message}`)
  const used: Allowance = { draft: 0, image: 0, rewrite: 0 }
  for (const row of data ?? []) {
    // WHY as: the column is text under a CHECK the generated type cannot see; `in` proves it.
    if (row.kind in used) used[row.kind as AllowanceKind] = row.count
  }
  return used
}

/** A refused spend, carrying what a screen needs to say why, worded in the agency's own zone. */
export class AllowanceError extends Error {
  readonly resetsOn: Date | null

  constructor(
    readonly kind: AllowanceKind,
    readonly used: number,
    readonly quota: number,
    readonly needed: number,
    entitlement: Pick<Entitlement, 'resetsOn' | 'timezone'>
  ) {
    super(allowanceUsedUp(kind, used, quota, needed, entitlement))
    this.name = 'AllowanceError'
    this.resetsOn = entitlement.resetsOn
  }
}

/**
 * Give back the images a boundary reserved for work that never produced a stored picture.
 *
 * `subscribeFal` reserves before the call and counts each paid call it completed on the spender
 * (`charged`); a download or storage failure after that would otherwise leave the customer
 * charged for a picture that does not exist. The boundary calls this from its failure path,
 * once, and the counter resets so a retry starts clean.
 */
export async function releaseCharged(spender: Spender): Promise<void> {
  const charged = spender.charged ?? 0
  if (!spender.agencyId || charged <= 0) return
  const entitlement = await getCachedEntitlement(spender.agencyId)
  await refundUsage(entitlement, spender.agencyId, 'image', charged)
  spender.charged = 0
}

/** The one 402 a route returns for an `AllowanceError`; null for any other error. */
export function allowanceResponse(err: AllowanceError): NextResponse
export function allowanceResponse(err: unknown): NextResponse | null
export function allowanceResponse(err: unknown): NextResponse | null {
  if (!(err instanceof AllowanceError)) return null
  return NextResponse.json(
    {
      error: err.message,
      code: 'allowance',
      kind: err.kind,
      used: err.used,
      quota: err.quota,
      needed: err.needed,
      resetsOn: err.resetsOn?.toISOString() ?? null,
    },
    { status: 402 }
  )
}
