import { daysUntilExpiry, isTokenExpired, isTokenExpiring } from '@/lib/meta/token-expiry'
import { POST_PLATFORMS } from '@/lib/validation'
import { extractInitials } from '@/utils/format'

/**
 * Pure derivation for the Clients roster. No Supabase, no React — every input is
 * passed in and `now` is injected, so the whole surface is testable without a DB.
 *
 * Status is derived rather than stored, which is why it cannot be filtered or
 * sorted in SQL: the page fetches the agency's client set once and does the rest
 * in memory. That also makes the chip counts and the summary band free.
 */

export type PostPlatform = (typeof POST_PLATFORMS)[number]

/** How a single channel is doing. Mirrors the three chip states in the mock. */
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

export interface RosterConnectionRow {
  platform: string | null
  account_name: string | null
  token_expires_at: string | null
}

export interface RosterClientRow {
  id: string
  name: string
  niche: string | null
  /** PostgREST returns an ARRAY here — social_connections is isOneToOne: false. */
  social_connections: RosterConnectionRow[] | null
}

export interface UpcomingPostRow {
  client_id: string | null
  scheduled_at: string | null
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

export interface RosterSummary {
  total: number
  /** Chip counts — these are CLIENTS. */
  attention: number
  approval: number
  connection: number
  empty: number
  /**
   * Band counts. `awaitingApprovalPosts` is POSTS, not clients: the mock's band
   * reads "6" while the chip beside it reads "1", because six posts are waiting
   * on one client. Conflating them silently makes both numbers wrong.
   */
  awaitingApprovalPosts: number
  oldestApprovalAt: string | null
}

// ─── Derivation ──────────────────────────────────────────────────────────────

/**
 * Older rows store display case ('Instagram') while the connect flow writes
 * lowercase — isValidPostPlatform carries the same warning.
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

/** The single status a row displays, highest precedence wins. */
function resolveStatus(
  channels: RosterChannel[],
  approvalCount: number,
  queuedCount: number
): ClientStatus {
  const hasLiveChannel = channels.some((c) => c.state !== 'missing')
  if (!hasLiveChannel) return 'connection_missing'
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

export function computeRosterEntry(
  row: RosterClientRow,
  upcoming: UpcomingPostRow[],
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
  upcoming: UpcomingPostRow[],
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

/** Sorted copy — the two orderings drawn in the mock. */
export function sortRoster(entries: ClientRosterEntry[], sort: RosterSort): ClientRosterEntry[] {
  const byName = (a: ClientRosterEntry, b: ClientRosterEntry) => a.name.localeCompare(b.name)
  if (sort === 'name') return [...entries].sort(byName)
  return [...entries].sort((a, b) => {
    const rank = STATUS_PRECEDENCE.indexOf(a.status) - STATUS_PRECEDENCE.indexOf(b.status)
    return rank !== 0 ? rank : byName(a, b)
  })
}
