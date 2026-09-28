import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  closeAbandonedRuns,
  fetchActiveRuns,
  fetchRecentRuns,
  fetchThemeDescriptions,
  fetchWaitingRuns,
  finishGenerationRun,
  lastCronRunAt,
  startGenerationRun,
  type RecentRun,
} from '../runs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminClient } from '@/lib/supabase/admin'
import type { Entitlement } from '@/lib/billing/entitlement'

const consumeUsage = vi.fn()
const settleUsage = vi.fn()
const getCachedEntitlement = vi.fn()
vi.mock('@/lib/billing/usage', async (importActual) => ({
  lastDailyResetAt: (await importActual<typeof import('@/lib/billing/usage')>()).lastDailyResetAt,
  consumeUsage: (...args: unknown[]) => consumeUsage(...args),
  settleUsage: (...args: unknown[]) => settleUsage(...args),
}))
vi.mock('@/lib/queries/cache', () => ({
  getCachedEntitlement: (...args: unknown[]) => getCachedEntitlement(...args),
}))

type InsertResult = {
  data: { id: string } | null
  error: { code?: string; message: string } | null
}

/** Captures the inserted row so the slot key can be asserted, and replays one canned result. */
function makeSupabase(result: InsertResult) {
  const inserted: Array<Record<string, unknown>> = []
  const supabase = {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return {
          select: () => ({ single: () => Promise.resolve(result) }),
        }
      },
    }),
  } as unknown as SupabaseClient
  return { supabase, inserted }
}

const ENTITLEMENT = {
  state: 'active',
  limits: { draft: 40, image: 120, rewrite: 30 },
  periodKey: '2026-09-01',
  resetsOn: new Date('2026-10-01T00:00:00Z'),
} as unknown as Entitlement

const INPUT = {
  clientId: 'c1',
  agencyId: 'a1',
  entitlement: ENTITLEMENT,
  targetCount: 3,
  kind: 'cron' as const,
}

const GIVE_BACK = { reserved: 3, landed: 0 }

beforeEach(() => {
  consumeUsage.mockReset().mockResolvedValue({ allowed: true })
  settleUsage.mockReset().mockResolvedValue(undefined)
  getCachedEntitlement.mockReset().mockResolvedValue({ ...ENTITLEMENT, periodKey: '2026-10-01' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('startGenerationRun', () => {
  it('stamps the slot it was given and the period it reserved from, so whoever settles lands the drafts there', async () => {
    const slotKey = new Date('2026-08-24T06:00:00Z')
    const { supabase, inserted } = makeSupabase({ data: { id: 'run-1' }, error: null })

    expect(await startGenerationRun(supabase, { ...INPUT, slotKey })).toEqual({ runId: 'run-1' })
    expect(inserted[0]).toMatchObject({
      client_id: 'c1',
      kind: 'cron',
      status: 'running',
      slot_key: '2026-08-24T06:00:00.000Z',
      period_key: '2026-09-01',
    })
  })

  it('a manual run carries an explicit null slot, so two never collide: NULLs do not conflict in a unique index', async () => {
    const { supabase, inserted } = makeSupabase({ data: { id: 'run-2' }, error: null })
    await startGenerationRun(supabase, { ...INPUT, kind: 'manual' })
    expect(inserted[0]?.slot_key).toBeNull()
  })

  it('reports a lost slot race (23505) as slotTaken, not a logged failure, and gives its reservation back', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = makeSupabase({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })

    expect(await startGenerationRun(supabase, { ...INPUT, slotKey: new Date() })).toEqual({
      runId: null,
      slotTaken: true,
    })
    expect(error).not.toHaveBeenCalled()
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', GIVE_BACK)
  })

  it('reserves the whole batch before the insert and refuses without inserting', async () => {
    const refused = Object.assign(new Error('used up'), { name: 'AllowanceError', used: 39 })
    consumeUsage.mockResolvedValue({ allowed: false, refused })
    const { supabase, inserted } = makeSupabase({ data: { id: 'run-9' }, error: null })

    const claim = await startGenerationRun(supabase, INPUT)
    expect(consumeUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', 3)
    expect(claim.runId).toBeNull()
    expect('refused' in claim && claim.refused).toBe(refused)
    expect(inserted).toHaveLength(0)
    expect(settleUsage).not.toHaveBeenCalled()
  })

  it('an insert that returns no row opens no run and gives the drafts back, since nothing could settle them', async () => {
    const { supabase } = makeSupabase({ data: null, error: null })
    expect(await startGenerationRun(supabase, INPUT)).toEqual({ runId: null, slotTaken: false })
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', GIVE_BACK)
  })

  it('a real insert failure is logged and is not a lost race', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = makeSupabase({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })

    expect(await startGenerationRun(supabase, INPUT)).toEqual({ runId: null, slotTaken: false })
    expect(error).toHaveBeenCalled()
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', GIVE_BACK)
  })
})

/**
 * The runs table as the finisher and the closer see it: a conditional flip out of `running`
 * returns the row only to the call that made it, and the posts count answers per run. WHY as:
 * only the chains these two functions build exist.
 */
function runTable(statuses: Record<string, string>, landed: Record<string, number> = {}) {
  const updates: Array<Record<string, unknown>> = []
  const supabase = {
    from: (table: string) => {
      if (table === 'posts') {
        return {
          select: () => ({
            eq: (_column: string, runId: string) =>
              Promise.resolve({ count: landed[runId] ?? 0, error: null }),
          }),
        }
      }
      const filters: Record<string, string> = {}
      const query = {
        update: (row: Record<string, unknown>) => {
          updates.push(row)
          const flip = {
            eq: (column: string, value: string) => {
              filters[column] = value
              return flip
            },
            select: () => {
              const id = filters.id!
              const flipped = statuses[id] === filters.status
              if (flipped) statuses[id] = String(row.status)
              return Promise.resolve({ data: flipped ? [{ id }] : [], error: null })
            },
          }
          return flip
        },
      }
      return query
    },
  }
  return { supabase: supabase as unknown as AdminClient & SupabaseClient, statuses, updates }
}

const OUTCOME = {
  agencyId: 'a1',
  entitlement: ENTITLEMENT,
  reserved: 3,
  skipped: null,
}

describe('finishGenerationRun', () => {
  it('counts the drafts that landed and gives the rest of the reservation back', async () => {
    const { supabase, updates } = runTable({ 'run-1': 'running' })
    await finishGenerationRun(supabase, 'run-1', {
      ...OUTCOME,
      status: 'complete',
      landed: 2,
      skipped: { names: ['Behind the scenes'], cost: 1 },
    })
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', { reserved: 3, landed: 2 })
    expect(updates[0]).toMatchObject({
      status: 'complete',
      skipped_pillars: { names: ['Behind the scenes'], cost: 1 },
    })
  })

  it('a failed run lands nothing, so nothing of it is on the meter', async () => {
    const { supabase, updates } = runTable({ 'run-1': 'running' })
    await finishGenerationRun(supabase, 'run-1', { ...OUTCOME, status: 'failed', landed: 0 })
    expect(settleUsage).toHaveBeenCalledWith(ENTITLEMENT, 'a1', 'draft', GIVE_BACK)
    expect(updates[0]).toMatchObject({ status: 'failed', skipped_pillars: null })
  })

  it('settles nothing when its flip finds the run already closed', async () => {
    const { supabase } = runTable({ 'run-1': 'complete' })
    await finishGenerationRun(supabase, 'run-1', { ...OUTCOME, status: 'complete', landed: 2 })
    expect(settleUsage).not.toHaveBeenCalled()
  })
})

const NOW = new Date('2026-09-26T08:00:00Z')

function run(overrides: Partial<RecentRun> = {}): RecentRun {
  return {
    id: 'run-1',
    clientId: 'c1',
    agencyId: 'a1',
    kind: 'cron',
    status: 'running',
    createdAt: '2026-09-26T07:30:00Z',
    targetCount: 3,
    periodKey: '2026-09-01',
    ...overrides,
  }
}

describe('closeAbandonedRuns', () => {
  it('closes a run left running, counts what landed into its period, and releases nothing if it predates the daily reset', async () => {
    const { supabase, statuses } = runTable({ 'run-1': 'running' }, { 'run-1': 2 })
    const runs = await closeAbandonedRuns(supabase, [run()], NOW)
    expect(statuses['run-1']).toBe('complete')
    expect(runs[0]?.status).toBe('complete')
    expect(settleUsage).toHaveBeenCalledWith(
      expect.objectContaining({ periodKey: '2026-09-01' }),
      'a1',
      'draft',
      { reserved: 3, landed: 2, release: 0 }
    )
  })

  it('releases the reservation of a run no daily reset can have cleared, or the slot it reopens is sized against it', async () => {
    const { supabase } = runTable({ 'run-1': 'running' })
    await closeAbandonedRuns(
      supabase,
      [run({ createdAt: '2026-09-26T08:30:00Z' })],
      new Date('2026-09-26T09:00:00Z')
    )
    expect(settleUsage).toHaveBeenCalledWith(expect.anything(), 'a1', 'draft', {
      reserved: 3,
      landed: 0,
      release: 3,
    })
  })

  it('closes a run with nothing landed as failed, so its slot is due again', async () => {
    const { supabase } = runTable({ 'run-1': 'running' })
    const runs = await closeAbandonedRuns(supabase, [run()], NOW)
    expect(runs[0]?.status).toBe('failed')
  })

  it('leaves a run younger than fifteen minutes alone', async () => {
    const { supabase, updates } = runTable({ 'run-1': 'running' })
    await closeAbandonedRuns(supabase, [run({ createdAt: '2026-09-26T07:50:00Z' })], NOW)
    expect(updates).toHaveLength(0)
  })

  it('closes a run with no recorded period without settling it', async () => {
    const { supabase, statuses } = runTable({ 'run-1': 'running' }, { 'run-1': 1 })
    await closeAbandonedRuns(supabase, [run({ periodKey: null })], NOW)
    expect(statuses['run-1']).toBe('complete')
    expect(settleUsage).not.toHaveBeenCalled()
  })

  it('two closers on one run settle it once', async () => {
    const { supabase } = runTable({ 'run-1': 'running' }, { 'run-1': 2 })
    await closeAbandonedRuns(supabase, [run()], NOW)
    await closeAbandonedRuns(supabase, [run()], NOW)
    expect(settleUsage).toHaveBeenCalledTimes(1)
  })

  it('the finisher and the closer settle a run once between them', async () => {
    const { supabase } = runTable({ 'run-1': 'running' }, { 'run-1': 2 })
    await closeAbandonedRuns(supabase, [run()], NOW)
    await finishGenerationRun(supabase, 'run-1', { ...OUTCOME, status: 'complete', landed: 2 })
    expect(settleUsage).toHaveBeenCalledTimes(1)
  })
})

/**
 * The runs query as `fetchRecentRuns` builds it, answering each page with `answer`, recording its
 * filters and ranges. WHY as: only the chain the reader builds exists.
 */
function runsQuery(
  answer: (
    from: number,
    to: number
  ) => { data: unknown[] | null; error: { message: string } | null }
) {
  const calls: Array<[string, ...unknown[]]> = []
  const query = {
    select: () => query,
    in: (...args: unknown[]) => (calls.push(['in', ...args]), query),
    or: (...args: unknown[]) => (calls.push(['or', ...args]), query),
    gte: (...args: unknown[]) => (calls.push(['gte', ...args]), query),
    order: () => query,
    range: (from: number, to: number) => {
      calls.push(['range', from, to])
      return Promise.resolve(answer(from, to))
    },
  }
  return { admin: { from: () => query } as unknown as AdminClient, calls }
}

const ROW = {
  id: 'run-1',
  client_id: 'c1',
  kind: 'cron',
  status: 'running',
  created_at: '2026-09-26T07:30:00Z',
  target_count: 3,
  period_key: '2026-09-01',
  clients: { agency_id: 'a1' },
}

describe('fetchRecentRuns and lastCronRunAt', () => {
  it('reads only what the dedup and the closer use, with each run’s agency', async () => {
    const { admin, calls } = runsQuery(() => ({ data: [ROW], error: null }))
    expect(await fetchRecentRuns(admin, NOW)).toEqual([run()])
    expect(calls).toEqual([
      ['in', 'status', ['running', 'complete']],
      ['or', 'kind.eq.cron,status.eq.running'],
      ['gte', 'created_at', NOW.toISOString()],
      ['range', 0, 999],
    ])
  })

  it('reads every page past the row cap', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ ...ROW, id: `run-${i}` }))
    const { admin } = runsQuery((from, to) => ({ data: rows.slice(from, to + 1), error: null }))
    expect(await fetchRecentRuns(admin, NOW)).toHaveLength(1001)
  })

  it('throws on a failed read, which would otherwise read as nothing ran', async () => {
    const { admin } = runsQuery(() => ({ data: null, error: { message: 'down' } }))
    await expect(fetchRecentRuns(admin, NOW)).rejects.toThrow('recent run query failed: down')
  })

  it('dates each client’s latest scheduled batch, ignoring manual runs (they cannot cancel the day’s batch) and failed ones (they saved nothing)', () => {
    const last = lastCronRunAt([
      run({ id: 'r1', createdAt: '2026-09-26T06:00:00Z', status: 'complete' }),
      run({ id: 'r2', createdAt: '2026-09-26T07:00:00Z', status: 'failed' }),
      run({ id: 'r3', createdAt: '2026-09-26T07:30:00Z', kind: 'manual' }),
      run({ id: 'r4', clientId: 'c2', createdAt: '2026-09-26T05:00:00Z' }),
    ])
    expect(last).toEqual(
      new Map([
        ['c1', Date.parse('2026-09-26T06:00:00Z')],
        ['c2', Date.parse('2026-09-26T05:00:00Z')],
      ])
    )
  })
})

/**
 * A read chain that answers `result` from whichever call ends it — each function below ends its
 * chain differently. WHY as: only the chain links these reads call exist.
 */
function readChain(result: { data: unknown; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {}
  for (const link of ['select', 'eq', 'gte', 'in', 'order']) chain[link] = () => chain
  chain.limit = () => Promise.resolve(result)
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result)
  return { from: () => chain } as unknown as SupabaseClient
}

describe('fetchActiveRuns', () => {
  it('names each run’s client and counts the posts its themes landed', async () => {
    const supabase = readChain({
      data: [
        {
          id: 'run-1',
          client_id: 'c1',
          created_at: '2026-09-26T07:30:00Z',
          target_count: 3,
          clients: { name: 'Bakery Sofia', agency_id: 'a1' },
          generation_themes: [{ post_count: 1 }, { post_count: null }, { post_count: 1 }],
        },
      ],
      error: null,
    })
    expect(await fetchActiveRuns(supabase, 'a1')).toEqual([
      {
        id: 'run-1',
        clientName: 'Bakery Sofia',
        targetCount: 3,
        doneCount: 2,
        startedAt: '2026-09-26T07:30:00Z',
      },
    ])
  })

  it('logs a failed read and answers no runs, since the empty answer alone would read as nothing generating', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = readChain({ data: null, error: { message: 'down' } })
    expect(await fetchActiveRuns(supabase, 'a1')).toEqual([])
    expect(error).toHaveBeenCalled()
  })
})

describe('fetchThemeDescriptions', () => {
  it('flattens the runs’ themes, dropping the ones with no description', async () => {
    const supabase = readChain({
      data: [
        { generation_themes: [{ theme_description: 'Sourdough' }, { theme_description: null }] },
        { generation_themes: [{ theme_description: 'Croissants' }] },
      ],
      error: null,
    })
    expect(await fetchThemeDescriptions(supabase, 'c1')).toEqual(['Sourdough', 'Croissants'])
  })
})

describe('fetchWaitingRuns', () => {
  it('reads the skipped pillars it can; a malformed or missing value reads as nothing, not a banner of undefined pillars', async () => {
    const supabase = readChain({
      data: [
        { id: 'r1', target_count: 3, skipped_pillars: { names: ['Team', 7, 'Events'], cost: 2 } },
        { id: 'r2', target_count: 2, skipped_pillars: { names: 'Team', cost: 1 } },
        { id: 'r3', target_count: 1, skipped_pillars: null },
      ],
      error: null,
    })
    const runs = await fetchWaitingRuns(supabase, ['r1', 'r2', 'r3'])
    expect(runs.get('r1')).toEqual({
      targetCount: 3,
      skipped: { names: ['Team', 'Events'], cost: 2 },
    })
    expect(runs.get('r2')).toEqual({ targetCount: 2, skipped: null })
    expect(runs.get('r3')).toEqual({ targetCount: 1, skipped: null })
  })
})
