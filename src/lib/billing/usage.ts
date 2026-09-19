import 'server-only'

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient, type AdminClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/notifications/notify'
import type { Entitlement } from './entitlement'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { runAsSpender, type Spender } from './spend-context'
import { ALLOWANCE_WARN_SHARE, type Allowance, type AllowanceKind } from './plans'
import { allowanceUsedUp, allowanceWarning } from './copy'

/**
 * The allowance ledger — one row per (agency, period, kind) in `usage_counters`, with two
 * numbers: `count`, what landed, and `pending`, what is in flight. A spend is reserved into
 * `pending` before the provider is asked (the `consume_usage` compare-and-set, migration
 * 20260857, atomic on count + pending against the quota) and settled once the thing exists —
 * the picture in storage, the drafts written, the rewrite answered — when `settle_usage` moves
 * what landed into `count` and releases the rest. The meter a customer sees is `count` alone,
 * so a failed generation is never on it, whatever killed it.
 *
 * Two layers. `consumeUsage` and `settleUsage` are the RPC pair, used directly by the run
 * lifecycle (src/lib/generation/runs.ts), which reserves a batch and lands part of it. Inside a
 * request the pair is driven by `reserveUsage` and `runMetered`: a boundary runs its work under
 * `runMetered`, anything inside reserves through `reserveUsage`, and the boundary's outcome —
 * resolved or thrown — settles every reservation at once. Always through the admin client,
 * because the RPCs are executable by the service role alone. A refusal is a value from the pair
 * and an `AllowanceError` from `reserveUsage`; a route answers it with `allowanceResponse` (402).
 */

type ConsumeResult =
  | {
      allowed: true
      /** Committed units — landed plus in flight — after this call. */
      used: number
      quota: number
    }
  | { allowed: false; refused: AllowanceError }

/**
 * Reserve `cost` units of `kind` against the entitlement's period; refused when the quota is zero
 * or the committed total would pass it. Nothing is counted yet: the reservation ends in
 * `settleUsage`, and until then it only holds the cap.
 */
export async function consumeUsage(
  entitlement: Entitlement,
  agencyId: string,
  kind: AllowanceKind,
  cost: number
): Promise<ConsumeResult> {
  const quota = entitlement.limits[kind]
  if (quota <= 0) {
    return { allowed: false, refused: new AllowanceError(kind, 0, 0, cost, entitlement) }
  }

  const { data, error } = await createAdminSupabaseClient().rpc('consume_usage', {
    p_agency_id: agencyId,
    p_period: entitlement.periodKey,
    p_kind: kind,
    p_cost: cost,
    p_quota: quota,
  })
  if (error) throw new Error(`consume_usage failed: ${error.message}`)
  const outcome = data?.[0] ?? { allowed: false, used: 0 }
  if (!outcome.allowed) {
    return {
      allowed: false,
      refused: new AllowanceError(kind, outcome.used, quota, cost, entitlement),
    }
  }
  return { allowed: true, used: outcome.used, quota }
}

/**
 * End a reservation: `landed` of the `reserved` units are counted, the rest given back — a
 * picture that reached storage, a run that wrote fewer drafts than it asked for, a rewrite that
 * threw. Never more than was reserved: the cap was checked against the reservation. The 80 % bell
 * fires on the call that carries `count` across the line and is telemetry: a bell that cannot be
 * written never undoes a settle. A failed RPC is logged, not thrown — the thing already exists,
 * and a settle that is lost is a free unit for the customer plus a pending one the daily
 * `clearStaleReservations` releases.
 */
export async function settleUsage(
  entitlement: Entitlement,
  agencyId: string,
  kind: AllowanceKind,
  reserved: number,
  landed: number
): Promise<void> {
  if (reserved <= 0) return
  const counted = Math.min(landed, reserved)
  const admin = createAdminSupabaseClient()
  const { data: count, error } = await admin.rpc('settle_usage', {
    p_agency_id: agencyId,
    p_period: entitlement.periodKey,
    p_kind: kind,
    p_reserved: reserved,
    p_landed: counted,
  })
  if (error) {
    console.error(`[billing] settle_usage failed for ${agencyId}/${kind}:`, error.message)
    return
  }

  const quota = entitlement.limits[kind]
  const line = quota * ALLOWANCE_WARN_SHARE
  if (counted > 0 && count !== null && count >= line && count - counted < line) {
    try {
      await notify(admin, {
        agencyId,
        type: 'allowance_warning',
        message: allowanceWarning(kind, count, quota, entitlement),
        cooldownDays: 31,
      })
    } catch (err) {
      console.warn(`[billing] could not record the allowance warning for ${agencyId}:`, err)
    }
  }
}

interface UsageRead {
  /** What exists — the meter a customer sees. */
  landed: Allowance
  /** Landed plus in flight — what the cap is measured against. */
  committed: Allowance
}

/** What the workspace has used this period, by kind — zero for a kind with no row yet. */
export async function readUsage(agencyId: string, periodKey: string): Promise<UsageRead> {
  const { data, error } = await createAdminSupabaseClient()
    .from('usage_counters')
    .select('kind, count, pending')
    .eq('agency_id', agencyId)
    .eq('period', periodKey)
  if (error) throw new Error(`usage_counters read failed: ${error.message}`)
  const landed: Allowance = { draft: 0, image: 0, rewrite: 0 }
  const committed: Allowance = { draft: 0, image: 0, rewrite: 0 }
  for (const row of data ?? []) {
    if (!(row.kind in landed)) continue
    // WHY as: the column is text under a CHECK the generated type cannot see; `in` proved it.
    const kind = row.kind as AllowanceKind
    landed[kind] = row.count
    committed[kind] = row.count + row.pending
  }
  return { landed, committed }
}

/**
 * Longer than any invocation may live (300 s is the largest `maxDuration`), so a row nothing has
 * reserved on for this long holds only what a killed invocation left behind.
 */
const STALE_RESERVATION_MS = 10 * 60_000

/**
 * Release the reservations a killed invocation never settled — the daily reset behind
 * `settleUsage`'s promise.
 *
 * Such a reservation stays in `pending`, where it holds what it reserved against the cap and
 * nothing else; releasing it once a day bounds that to a morning. Only rows whose last
 * reservation is older than `STALE_RESERVATION_MS` are touched: the billing cron shares its
 * minute with the hourly generate cron, whose batches are reserved seconds before it runs, and a
 * reservation in flight must keep holding the cap until its own settle.
 */
export async function clearStaleReservations(admin: AdminClient): Promise<number> {
  const { data, error } = await admin
    .from('usage_counters')
    .update({ pending: 0 })
    .gt('pending', 0)
    .lt('reserved_at', new Date(Date.now() - STALE_RESERVATION_MS).toISOString())
    .select('agency_id')
  if (error) throw new Error(`usage_counters reset failed: ${error.message}`)
  return data?.length ?? 0
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
 * Reserve inside a metered boundary: the workspace's entitlement, the compare-and-set, the
 * refusal as a throw, and the reservation held on the spender for `runMetered` to settle. Refuses
 * a spender no `runMetered` is watching — a reservation nobody would settle is the leak this
 * whole ledger exists to close — which is what lets a provider wrapper deep in the engine reserve
 * without knowing which route it is under.
 */
export async function reserveUsage(
  spender: Spender,
  kind: AllowanceKind,
  cost: number
): Promise<void> {
  if (!spender.agencyId || spender.reserved === undefined) {
    throw new Error(`${kind}: a paid call outside runMetered — nobody would settle it`)
  }
  const entitlement = await getCachedEntitlement(spender.agencyId)
  const reserved = await consumeUsage(entitlement, spender.agencyId, kind, cost)
  if (!reserved.allowed) throw reserved.refused
  spender.reserved[kind] = (spender.reserved[kind] ?? 0) + cost
}

/**
 * Run a spend and settle what it reserved: every `reserveUsage` inside `fn` is counted when `fn`
 * resolves — the picture is in storage, the rewrite answered — and given back when it throws, so
 * a failed generation is never on the meter and no boundary carries a release of its own. A
 * boundary is one landing: everything between the reservation and the stored result runs inside
 * `fn`.
 */
export async function runMetered<T>(spender: Spender, fn: () => Promise<T>): Promise<T> {
  spender.reserved = {}
  try {
    const result = await runAsSpender(spender, fn)
    await settleReserved(spender, true)
    return result
  } catch (err) {
    await settleReserved(spender, false)
    throw err
  }
}

async function settleReserved(spender: Spender, landed: boolean): Promise<void> {
  const held = Object.entries(spender.reserved ?? {}).filter(([, cost]) => (cost ?? 0) > 0)
  if (!spender.agencyId || held.length === 0) return
  const entitlement = await getCachedEntitlement(spender.agencyId)
  for (const [kind, cost] of held) {
    // WHY as: the keys of `reserved` are written only by `reserveUsage`, typed on `AllowanceKind`.
    await settleUsage(entitlement, spender.agencyId, kind as AllowanceKind, cost, landed ? cost : 0)
  }
  spender.reserved = {}
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

/**
 * The answer to a spend that failed under `runMetered`: the 402 when the allowance refused it,
 * otherwise the error's own words — a provider's reason is what the person can act on — behind
 * `status` (502 when the provider failed, 500 when we did), logged under `scope`.
 */
export function spendFailureResponse(
  err: unknown,
  scope: string,
  fallback: string,
  status: 500 | 502
): NextResponse {
  const refusal = allowanceResponse(err)
  if (refusal) return refusal
  console.error(`[${scope}] failed:`, err)
  return NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status })
}
