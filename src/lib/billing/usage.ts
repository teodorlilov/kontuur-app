import 'server-only'

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/notifications/notify'
import type { Entitlement } from './entitlement'
import type { Allowance, AllowanceKind } from './plans'
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

/** Warn once per period when an allowance crosses this share. */
const WARN_AT = 0.8

interface ConsumeResult {
  allowed: boolean
  used: number
  quota: number
}

/** Reserve `cost` units of `kind` against the entitlement's period; refused when the quota is zero. */
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

  if (outcome.allowed && outcome.used >= quota * WARN_AT && outcome.used - cost < quota * WARN_AT) {
    await notify(admin, {
      agencyId,
      type: 'allowance_warning',
      message: allowanceWarning(kind, outcome.used, quota, entitlement.periodKey),
      cooldownDays: 31,
    })
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

/** A refused spend, carrying what a screen needs to say why. */
export class AllowanceError extends Error {
  constructor(
    readonly kind: AllowanceKind,
    readonly used: number,
    readonly quota: number,
    readonly resetsOn: Date | null
  ) {
    super(allowanceUsedUp(kind, used, quota, resetsOn))
    this.name = 'AllowanceError'
  }
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
      resetsOn: err.resetsOn?.toISOString() ?? null,
    },
    { status: 402 }
  )
}
