import 'server-only'

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient, type AdminClient } from '@/lib/supabase/admin'
import { notify } from '@/lib/notifications/notify'
import type { Entitlement } from './entitlement'
import { getCachedEntitlement } from '@/lib/queries/cache'
import { readPages } from '@/lib/queries/read-pages'
import { runAsSpender, type Spender } from './spend-context'
import { ALLOWANCE_KINDS, ALLOWANCE_WARN_SHARE, type Allowance, type AllowanceKind } from './plans'
import { allowanceUsedUp, allowanceWarning, type OwedImages } from './copy'

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

type ConsumeResult = { allowed: true } | { allowed: false; refused: AllowanceError }

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
  return { allowed: true }
}

/**
 * End a reservation: count `landed` of the `reserved` units (never more — the cap was checked
 * against the reservation) and take `release` units out of `pending`, the whole reservation unless
 * it may already have been cleared (`closeAbandonedRuns`, src/lib/generation/runs.ts). Settle with
 * the reserving entitlement, so the units land in the period they were reserved from. The 80 %
 * bell is telemetry and never undoes a settle. A failed RPC is logged, not thrown: the thing
 * already exists, and a lost settle is a free unit plus a pending one `clearStaleReservations`
 * releases.
 */
export async function settleUsage(
  entitlement: Entitlement,
  agencyId: string,
  kind: AllowanceKind,
  settle: { reserved: number; landed: number; release?: number }
): Promise<void> {
  const counted = Math.max(0, Math.min(settle.landed, settle.reserved))
  const release = settle.release ?? settle.reserved
  if (counted <= 0 && release <= 0) return
  const admin = createAdminSupabaseClient()
  const { data: count, error } = await admin.rpc('settle_usage', {
    p_agency_id: agencyId,
    p_period: entitlement.periodKey,
    p_kind: kind,
    p_reserved: release,
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
        dedupKey: `allowance_warning:${entitlement.periodKey}:${kind}`,
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

/** Whether a stored `kind` is an allowance pool — the generated type reads the column as text. */
function isAllowanceKind(kind: string): kind is AllowanceKind {
  return ALLOWANCE_KINDS.some((known) => known === kind)
}

/**
 * What each workspace has used in its own period, by kind — zero for a kind with no row yet — in
 * ONE query: every agency's rows in any of the periods named, kept only where the row's period is
 * that agency's. The query is read a page at a time (`readPages`) in the table's key order
 * (agency, period, kind: migration 20260852), so a roster past PostgREST's 1000-row answer is read
 * whole. The crons read their whole roster this way, so a tick makes one usage read rather than
 * one per workspace, and a failed page fails the tick, as its schedules read does.
 */
export async function readUsageByAgency(
  entries: ReadonlyArray<{ agencyId: string; periodKey: string }>
): Promise<Map<string, UsageRead>> {
  const out = new Map<string, UsageRead>()
  if (entries.length === 0) return out
  const periodOf = new Map(entries.map((entry) => [entry.agencyId, entry.periodKey]))
  for (const agencyId of periodOf.keys()) {
    out.set(agencyId, {
      landed: { draft: 0, image: 0, rewrite: 0 },
      committed: { draft: 0, image: 0, rewrite: 0 },
    })
  }
  const agencyIds = [...periodOf.keys()]
  const periods = [...new Set(periodOf.values())]
  const admin = createAdminSupabaseClient()
  const pages = readPages('usage_counters read', (from, to) =>
    admin
      .from('usage_counters')
      .select('agency_id, period, kind, count, pending')
      .in('agency_id', agencyIds)
      .in('period', periods)
      .order('agency_id')
      .order('period')
      .order('kind')
      .range(from, to)
  )
  for await (const rows of pages) {
    for (const row of rows) {
      const usage = out.get(row.agency_id)
      if (!usage || periodOf.get(row.agency_id) !== row.period || !isAllowanceKind(row.kind)) {
        continue
      }
      usage.landed[row.kind] = row.count
      usage.committed[row.kind] = row.count + row.pending
    }
  }
  return out
}

/**
 * What one workspace has used this period — `readUsageByAgency` for one entry, whose map holds an
 * entry for every agency asked about.
 */
export async function readUsage(agencyId: string, periodKey: string): Promise<UsageRead> {
  return (await readUsageByAgency([{ agencyId, periodKey }])).get(agencyId)!
}

/**
 * Longer than any invocation may live (300 s is the largest `maxDuration`), so a row nothing has
 * reserved on for this long holds only what a killed invocation left behind.
 */
const STALE_RESERVATION_MS = 10 * 60_000

/** The UTC hour the billing cron runs `clearStaleReservations` (vercel.json, "0 8 * * *"). */
const DAILY_RESET_HOUR_UTC = 8

/**
 * The most recent moment the daily reset was due. A reservation taken after it cannot have been
 * cleared by it — the reset only clears rows reserved on more than `STALE_RESERVATION_MS` before
 * it runs — so its owner may still release it exactly (the abandoned-run closer,
 * src/lib/generation/runs.ts). A reset delayed by more than ten minutes is the one case this
 * misjudges.
 */
export function lastDailyResetAt(now: Date): Date {
  const reset = new Date(now)
  reset.setUTCHours(DAILY_RESET_HOUR_UTC, 0, 0, 0)
  if (reset > now) reset.setUTCDate(reset.getUTCDate() - 1)
  return reset
}

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

/**
 * A refused spend, carrying what a screen needs to say why, worded in the agency's own zone. `used`
 * is the counted figure; pictures earlier posts still owe, when they are the reason, are named in
 * the message (`owed`).
 */
export class AllowanceError extends Error {
  readonly resetsOn: Date | null

  constructor(
    readonly kind: AllowanceKind,
    readonly used: number,
    readonly quota: number,
    readonly needed: number,
    entitlement: Pick<Entitlement, 'resetsOn' | 'timezone' | 'paymentFailed'>,
    owed?: OwedImages
  ) {
    super(allowanceUsedUp(kind, used, quota, needed, entitlement, owed))
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
  spender.entitlement ??= await getCachedEntitlement(spender.agencyId)
  const reserved = await consumeUsage(spender.entitlement, spender.agencyId, kind, cost)
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

/**
 * Settle everything the spender holds against the entitlement it reserved with (`reserveUsage`
 * filled it), pool by pool in `ALLOWANCE_KINDS` order.
 */
async function settleReserved(spender: Spender, landed: boolean): Promise<void> {
  const { agencyId, entitlement, reserved = {} } = spender
  const held = ALLOWANCE_KINDS.filter((kind) => (reserved[kind] ?? 0) > 0)
  if (!agencyId || !entitlement || held.length === 0) return
  for (const kind of held) {
    const cost = reserved[kind] ?? 0
    await settleUsage(entitlement, agencyId, kind, { reserved: cost, landed: landed ? cost : 0 })
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
 * otherwise a 502 in the error's own words — a metered route's work is a provider call (a model,
 * an image), and the provider's reason is what the person can act on — logged under `scope`.
 */
export function spendFailureResponse(err: unknown, scope: string, fallback: string): NextResponse {
  const refusal = allowanceResponse(err)
  if (refusal) return refusal
  console.error(`[${scope}] failed:`, err)
  return NextResponse.json(
    { error: err instanceof Error ? err.message : fallback },
    { status: 502 }
  )
}
