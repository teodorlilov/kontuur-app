import { describe, expect, it } from 'vitest'
import {
  type ClientStatus,
  type PendingApprovalRow,
  type RosterClientRow,
  type RosterConnectionRow,
  STATUS_PRECEDENCE,
  buildRoster,
  computeRosterEntry,
  matchesFilter,
  sortRoster,
  summariseRoster,
} from '../roster'
import type { PostSummary } from '@/types/post'

const NOW = new Date('2026-07-31T12:00:00Z')
const MS_PER_DAY = 86_400_000

function offset(days: number): string {
  return new Date(NOW.getTime() + days * MS_PER_DAY).toISOString()
}

function connection(over: Partial<RosterConnectionRow> = {}): RosterConnectionRow {
  return { platform: 'instagram', account_name: 'acct', token_expires_at: offset(90), ...over }
}

/** Healthy by default: Instagram live, one queued post, nothing awaiting approval. */
function client(over: Partial<RosterClientRow> = {}): RosterClientRow {
  return {
    id: 'c1',
    name: 'Haelan',
    niche: 'Healthcare',
    social_connections: [connection()],
    ...over,
  }
}

/**
 * An upcoming row as the roster reads it.
 *
 * `id` and `platform` exist on the shared type for the dashboard's next-up card and mean nothing
 * here, so they are filled in once rather than repeated across every fixture.
 */
function up(clientId: string, scheduledAt: string): PostSummary {
  return {
    id: `post-${clientId}-${scheduledAt}`,
    client_id: clientId,
    platform: 'instagram',
    scheduled_at: scheduledAt,
  }
}

function entry(
  over: Partial<RosterClientRow> = {},
  upcoming: PostSummary[] = [up('c1', offset(1))],
  approvals: PendingApprovalRow[] = []
) {
  return computeRosterEntry(client(over), upcoming, approvals, NOW)
}

describe('STATUS_PRECEDENCE', () => {
  it('ranks most urgent first', () => {
    expect(STATUS_PRECEDENCE).toEqual([
      'connection_missing',
      'awaiting_approval',
      'connection_expiring',
      'queue_empty',
      'on_schedule',
    ])
  })

  it('covers every status exactly once', () => {
    const all: ClientStatus[] = [
      'connection_missing',
      'awaiting_approval',
      'connection_expiring',
      'queue_empty',
      'on_schedule',
    ]
    expect([...STATUS_PRECEDENCE].sort()).toEqual(all.sort())
    expect(new Set(STATUS_PRECEDENCE).size).toBe(STATUS_PRECEDENCE.length)
  })
})

describe('computeRosterEntry — every status is reachable', () => {
  it('connection_missing when no channel is live', () => {
    expect(entry({ social_connections: [] }).status).toBe('connection_missing')
  })

  it('awaiting_approval outranks a queue problem', () => {
    const result = entry({}, [], [{ client_id: 'c1', created_at: offset(-4) }])
    expect(result.status).toBe('awaiting_approval')
    expect(result.approvalCount).toBe(1)
  })

  it('connection_expiring when a token lapses inside the window', () => {
    const rows = [connection({ token_expires_at: offset(6) })]
    const result = entry({ social_connections: rows })
    expect(result.status).toBe('connection_expiring')
    expect(result.expiresInDays).toBe(6)
  })

  it('queue_empty when nothing is scheduled', () => {
    const result = entry({}, [])
    expect(result.status).toBe('queue_empty')
    expect(result.nextPostAt).toBeNull()
    expect(result.queuedCount).toBe(0)
  })

  it('on_schedule when everything is healthy', () => {
    expect(entry().status).toBe('on_schedule')
    expect(entry().needsAttention).toBe(false)
  })
})

describe('computeRosterEntry — null expiry', () => {
  it('keeps a connection with a null expiry connected', () => {
    // NULL means "never expires" — older connect flows stored no expiry, and
    // reading null as expired would turn every such healthy client red.
    const rows = [connection({ token_expires_at: null })]
    const result = entry({ social_connections: rows })
    expect(result.status).toBe('on_schedule')
    expect(result.channels.find((c) => c.platform === 'instagram')?.state).toBe('connected')
  })
})

describe('computeRosterEntry — channels', () => {
  it('renders one chip per supported platform even when absent', () => {
    const result = entry({ social_connections: [] })
    expect(result.channels.map((c) => c.platform)).toEqual(['instagram'])
    expect(result.channels.find((c) => c.platform === 'instagram')?.state).toBe('missing')
  })

  it('never renders Canva as a social channel', () => {
    const rows = [connection(), connection({ platform: 'canva' })]
    const result = entry({ social_connections: rows })
    expect(result.channels).toHaveLength(1)
    expect(result.channels.some((c) => (c.platform as string) === 'canva')).toBe(false)
  })

  it('matches platform case-insensitively for older display-case rows', () => {
    const rows = [connection({ platform: 'Instagram' })]
    expect(entry({ social_connections: rows }).channels[0]?.state).toBe('connected')
  })

  it('treats an already-lapsed token as missing, not expiring', () => {
    const rows = [connection({ token_expires_at: offset(-1) })]
    const result = entry({ social_connections: rows })
    expect(result.channels[0]?.state).toBe('missing')
    expect(result.status).toBe('connection_missing')
  })
})

describe('computeRosterEntry — aggregates', () => {
  it('takes the earliest scheduled post and counts the rest behind it', () => {
    const upcoming: PostSummary[] = [up('c1', offset(5)), up('c1', offset(2)), up('c1', offset(9))]
    const result = entry({}, upcoming)
    expect(result.nextPostAt).toBe(offset(2))
    expect(result.queuedCount).toBe(3)
  })

  it('reports the oldest approval, not the newest', () => {
    const approvals: PendingApprovalRow[] = [
      { client_id: 'c1', created_at: offset(-1) },
      { client_id: 'c1', created_at: offset(-4) },
    ]
    expect(entry({}, [], approvals).oldestApprovalAt).toBe(offset(-4))
  })

  it('derives initials for non-Latin names', () => {
    expect(entry({ name: 'ЕВЕРЕСТ ИМОТИ' }).initials).toBe('ЕИ')
  })
})

describe('buildRoster', () => {
  it('joins each client to only its own rows', () => {
    const clients = [client(), client({ id: 'c2', name: 'FlexHome' })]
    const upcoming: PostSummary[] = [up('c1', offset(1)), up('c2', offset(3)), up('c2', offset(4))]
    const approvals: PendingApprovalRow[] = [{ client_id: 'c1', created_at: offset(-4) }]
    const [first, second] = buildRoster(clients, upcoming, approvals, NOW)

    expect(first?.queuedCount).toBe(1)
    expect(first?.approvalCount).toBe(1)
    expect(second?.queuedCount).toBe(2)
    expect(second?.approvalCount).toBe(0)
  })

  // Exercised through approvals rather than upcoming: posts.client_id is NOT NULL,
  // so only the approval read can still hand groupByClient a null foreign key.
  it('ignores rows whose foreign key came back null', () => {
    const approvals: PendingApprovalRow[] = [{ client_id: null, created_at: offset(-4) }]
    expect(buildRoster([client()], [], approvals, NOW)[0]?.approvalCount).toBe(0)
  })
})

describe('summariseRoster', () => {
  const roster = buildRoster(
    [
      client({ id: 'a', name: 'Approval' }),
      client({
        id: 'b',
        name: 'Expiring',
        social_connections: [connection({ token_expires_at: offset(6) })],
      }),
      client({ id: 'c', name: 'Empty' }),
      client({ id: 'd', name: 'Healthy' }),
    ],
    [up('a', offset(1)), up('b', offset(1)), up('d', offset(1))],
    [
      { client_id: 'a', created_at: offset(-4) },
      { client_id: 'a', created_at: offset(-2) },
    ],
    NOW
  )
  const summary = summariseRoster(roster)

  it('counts needs-attention as exactly the union of the three narrower chips', () => {
    expect(summary.attention).toBe(summary.approval + summary.connection + summary.empty)
    expect(summary.attention).toBe(3)
  })

  it('counts CLIENTS in the chips but POSTS in the band', () => {
    // Two posts are waiting, both on one client: the two figures must not be conflated.
    expect(summary.approval).toBe(1)
    expect(summary.awaitingApprovalPosts).toBe(2)
  })

  it('reports the oldest approval across the whole agency', () => {
    expect(summary.oldestApprovalAt).toBe(offset(-4))
  })

  it('counts every client in the total', () => {
    expect(summary.total).toBe(4)
  })

  it('folds a missing connection into the connection chip so the union holds', () => {
    const withMissing = buildRoster([client({ social_connections: [] })], [], [], NOW)
    const result = summariseRoster(withMissing)
    expect(result.connection).toBe(1)
    expect(result.attention).toBe(result.approval + result.connection + result.empty)
  })
})

describe('matchesFilter', () => {
  it('passes everything under "all"', () => {
    expect(matchesFilter(entry(), 'all')).toBe(true)
  })

  it('excludes healthy clients from "attention"', () => {
    expect(matchesFilter(entry(), 'attention')).toBe(false)
  })
})

describe('sortRoster', () => {
  const roster = buildRoster(
    [
      client({ id: 'z', name: 'Zed' }),
      client({ id: 'a', name: 'Ada', social_connections: [] }),
      client({ id: 'm', name: 'Mona' }),
    ],
    [up('z', offset(1)), up('m', offset(1))],
    [],
    NOW
  )

  it('puts the most urgent first, then breaks ties by name', () => {
    expect(sortRoster(roster, 'attention').map((e) => e.name)).toEqual(['Ada', 'Mona', 'Zed'])
  })

  it('sorts by name alone when asked', () => {
    expect(sortRoster(roster, 'name').map((e) => e.name)).toEqual(['Ada', 'Mona', 'Zed'])
  })

  it('does not mutate the input', () => {
    const before = roster.map((e) => e.id)
    sortRoster(roster, 'name')
    expect(roster.map((e) => e.id)).toEqual(before)
  })
})
