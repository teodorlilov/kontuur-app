import { daysUntilExpiry, isTokenExpired, isTokenExpiring } from '@/lib/meta/token-expiry'
import { POST_PLATFORMS } from '@/lib/validation'
import { extractInitials } from '@/utils/format'
import type { PostSummary } from '@/types/post'
import type { ClientRow, SocialConnectionRow } from '@/types'

/**
 * Pure derivation for the Clients roster. No Supabase, no React — every input is
 * passed in and `now` is injected, so the whole surface is testable without a DB.
 *
 * Status is derived rather than stored, which is why it cannot be filtered or
 * sorted in SQL: the page fetches the agency's client set once and does the rest
 * in memory. That also makes the chip counts and the summary band free.
 */

export type PostPlatform = (typeof POST_PLATFORMS)[number]

/** How a single channel is doing. */
export type ChannelState = 'connected' | 'expiring' | 'missing'

export interface RosterChannel {
  platform: PostPlatform
  state: ChannelState
  accountName: string | null
  /** Whole days until this channel's token lapses; null when it never does. */
  expiresInDays: number | null
}

export type ClientStatus =
  | 'connection_missing'
  | 'awaiting_approval'
  | 'connection_expiring'
  | 'queue_empty'
  | 'on_schedule'

/**
 * Most urgent first. Exported so tests assert the ordering itself rather than
 * re-encoding it, and so resolveStatus cannot drift from what the UI ranks by.
 */
export const STATUS_PRECEDENCE: readonly ClientStatus[] = [
  'connection_missing',
  'awaiting_approval',
  'connection_expiring',
  'queue_empty',
  'on_schedule',
]

/** The filter chips drawn above the table. */
export type RosterFilter = 'attention' | 'approval' | 'connection' | 'empty' | 'all'

// ─── Input rows ──────────────────────────────────────────────────────────────
// Defined here and imported *by* the query layer, so the derivation owns its
// contract instead of inheriting whatever shape PostgREST happened to return.

/** Derived: the hand-written version declared `platform` and `account_name` nullable over
 *  NOT NULL columns, so every reader carried a guard for a state the schema forbids. */
export type RosterConnectionRow = Pick<
  SocialConnectionRow,
  'platform' | 'account_name' | 'token_expires_at'
>

export type RosterClientRow = Pick<ClientRow, 'id' | 'name' | 'niche'> & {
  /** PostgREST returns an ARRAY here — social_connections is isOneToOne: false. */
  social_connections: RosterConnectionRow[] | null
}

export interface PendingApprovalRow {
  client_id: string | null
  created_at: string | null
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface ClientRosterEntry {
  id: string
  name: string
  niche: string | null
  initials: string
  channels: RosterChannel[]
  status: ClientStatus
  needsAttention: boolean
  /** Posts awaiting client approval, and when the oldest was sent. */
  approvalCount: number
  oldestApprovalAt: string | null
  /** Next scheduled post, and how many are queued behind it. */
  nextPostAt: string | null
  queuedCount: number
  /**
   * Furthest-out scheduled post, so a healthy row can say how far cover extends
   * from real data rather than asserting an unbacked "all clear".
   */
  lastPostAt: string | null
  /** Days until the soonest-lapsing channel, for "expires in 6 days" copy. */
  expiresInDays: number | null
}

interface RosterSummary {
  total: number
  /** Chip counts — these are CLIENTS. */
  attention: number
  approval: number
  connection: number
  empty: number
  /**
   * Band counts. `awaitingApprovalPosts` is POSTS, not clients: six posts can be
   * waiting on a single client, so the band reads "6" beside a client chip that
   * reads "1". Conflating them silently makes both numbers wrong.
   */
  awaitingApprovalPosts: number
  oldestApprovalAt: string | null
}

// ─── Derivation ──────────────────────────────────────────────────────────────

/**
 * The connect flow writes lowercase, but tolerate display case so a hand-fixed or
 * legacy social_connections row still matches its chip.
 */
function normalisePlatform(platform: string | null): PostPlatform | null {
  const match = POST_PLATFORMS.find((p) => p === platform?.toLowerCase())
  return match ?? null
}

/**
 * One chip per supported platform, always — an absent channel renders as a
 * dashed "missing" chip rather than vanishing, so the column stays legible
 * across rows. Canva rows share this table and are filtered out here.
 */
function buildChannels(rows: RosterConnectionRow[], now: Date): RosterChannel[] {
  return POST_PLATFORMS.map((platform) => {
    const row = rows.find((r) => normalisePlatform(r.platform) === platform)
    if (!row) {
      return { platform, state: 'missing' as const, accountName: null, expiresInDays: null }
    }
    // A lapsed token cannot publish, so it reads as missing rather than expiring.
    const state: ChannelState = isTokenExpired(row.token_expires_at, now)
      ? 'missing'
      : isTokenExpiring(row.token_expires_at, now)
        ? 'expiring'
        : 'connected'
    return {
      platform,
      state,
      accountName: row.account_name,
      expiresInDays: daysUntilExpiry(row.token_expires_at, now),
    }
  })
}

/**
 * Can this client publish to anything right now? The one definition of "connected".
 *
 * The dashboard's own count answered this with "does a social_connections row exist for the
 * agency" — no platform filter, no expiry check. So a client whose Instagram token had lapsed sat
 * at the top of the roster's "Needs attention" reading "No account connected", while the dashboard
 * counted it as connected and, because the next-up card derives `unconnected` by subtraction,
 * dropped it out of the "Connect accounts" prompt entirely — steering the agency toward generating
 * more content for a client that cannot publish.
 *
 * Nothing sweeps a lapsed row, so that state is permanent until someone reconnects.
 */
export function hasLiveChannel(rows: RosterConnectionRow[], now: Date): boolean {
  return buildChannels(rows, now).some((channel) => channel.state !== 'missing')
}

/** The single status a row displays, highest precedence wins. */
function resolveStatus(
  channels: RosterChannel[],
  approvalCount: number,
  queuedCount: number
): ClientStatus {
  // Same rule as `hasLiveChannel`, off channels the caller already built.
  if (!channels.some((c) => c.state !== 'missing')) return 'connection_missing'
  if (approvalCount > 0) return 'awaiting_approval'
  if (channels.some((c) => c.state === 'expiring')) return 'connection_expiring'
  if (queuedCount === 0) return 'queue_empty'
  return 'on_schedule'
}

/** Earliest of two nullable ISO timestamps. */
function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

/** Latest of two nullable ISO timestamps. */
function latest(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

/**
 * Folds one client and its two related reads into the single row the roster
 * renders — channel states, the status that ranks it, and the counts behind it.
 * `now` is passed in rather than read here so a whole page derives from one
 * instant and connection expiry cannot straddle a tick mid-render.
 */
export function computeRosterEntry(
  row: RosterClientRow,
  upcoming: PostSummary[],
  approvals: PendingApprovalRow[],
  now: Date
): ClientRosterEntry {
  const channels = buildChannels(row.social_connections ?? [], now)
  const status = resolveStatus(channels, approvals.length, upcoming.length)

  // flatMap over filter+cast: dropping the nulls and unwrapping in one step
  // narrows to number[] without an assertion.
  const expiring = channels.flatMap((c) =>
    c.state === 'expiring' && c.expiresInDays !== null ? [c.expiresInDays] : []
  )

  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    initials: extractInitials(row.name),
    channels,
    status,
    needsAttention: status !== 'on_schedule',
    approvalCount: approvals.length,
    oldestApprovalAt: approvals.reduce<string | null>((a, r) => earliest(a, r.created_at), null),
    nextPostAt: upcoming.reduce<string | null>((a, r) => earliest(a, r.scheduled_at), null),
    queuedCount: upcoming.length,
    lastPostAt: upcoming.reduce<string | null>((a, r) => latest(a, r.scheduled_at), null),
    expiresInDays: expiring.length > 0 ? Math.min(...expiring) : null,
  }
}

/** Index rows by client_id, dropping any whose foreign key came back null. */
function groupByClient<T extends { client_id: string | null }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    if (!row.client_id) continue
    const bucket = grouped.get(row.client_id)
    if (bucket) bucket.push(row)
    else grouped.set(row.client_id, [row])
  }
  return grouped
}

/** Join the three queries in memory and derive every row. */
export function buildRoster(
  clients: RosterClientRow[],
  upcoming: PostSummary[],
  approvals: PendingApprovalRow[],
  now: Date
): ClientRosterEntry[] {
  const upcomingByClient = groupByClient(upcoming)
  const approvalsByClient = groupByClient(approvals)
  return clients.map((row) =>
    computeRosterEntry(
      row,
      upcomingByClient.get(row.id) ?? [],
      approvalsByClient.get(row.id) ?? [],
      now
    )
  )
}

/**
 * `connection` deliberately matches both missing and expiring: both mean this
 * client's publishing is broken or about to break, and folding them keeps
 * "Needs attention" an exact union of the three narrower chips.
 */
export function matchesFilter(entry: ClientRosterEntry, filter: RosterFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'attention':
      return entry.needsAttention
    case 'approval':
      return entry.status === 'awaiting_approval'
    case 'connection':
      return entry.status === 'connection_expiring' || entry.status === 'connection_missing'
    case 'empty':
      return entry.status === 'queue_empty'
  }
}

/** Totals behind the filter rail, counted from entries rather than re-queried. */
export function summariseRoster(entries: ClientRosterEntry[]): RosterSummary {
  const count = (filter: RosterFilter) => entries.filter((e) => matchesFilter(e, filter)).length
  return {
    total: entries.length,
    attention: count('attention'),
    approval: count('approval'),
    connection: count('connection'),
    empty: count('empty'),
    awaitingApprovalPosts: entries.reduce((sum, e) => sum + e.approvalCount, 0),
    oldestApprovalAt: entries.reduce<string | null>(
      (a, e) => earliest(a, e.oldestApprovalAt),
      null
    ),
  }
}

export type RosterSort = 'attention' | 'name'

/** Sorted copy. Urgency first by default; by name when the user asks for it. */
export function sortRoster(entries: ClientRosterEntry[], sort: RosterSort): ClientRosterEntry[] {
  const byName = (a: ClientRosterEntry, b: ClientRosterEntry) => a.name.localeCompare(b.name)
  if (sort === 'name') return [...entries].sort(byName)
  return [...entries].sort((a, b) => {
    const rank = STATUS_PRECEDENCE.indexOf(a.status) - STATUS_PRECEDENCE.indexOf(b.status)
    return rank !== 0 ? rank : byName(a, b)
  })
}
