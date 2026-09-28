import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { notify, NOTIFY_EVERY_TIME } from '../notify'

interface Answers {
  /** Rows the cooldown check finds; null makes that read fail. */
  existing: unknown[] | null
  /** The insert's answer. */
  insertError: { message: string } | null
  /** The client row a `clientId` resolves to. */
  client: { agency_id: string | null; name: string } | null
  /** What a keyed upsert returns: the rows it inserted, or its error. */
  keyed?: { data: unknown[] | null; error: { message: string } | null }
}

/**
 * A recorder in place of the admin client: the cooldown read, the insert and the client lookup
 * each answer from `answers`, and what was inserted is kept for the assertions. Cast through
 * `unknown` because only the methods `notify` chains exist — a new one fails at runtime, which is
 * the intent.
 */
function makeAdmin(answers: Answers) {
  const reads: string[] = []
  const inserted: Array<Record<string, unknown>> = []
  const upserts: Array<{ row: Record<string, unknown>; options: unknown }> = []
  const admin = {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve({ data: answers.client, error: null }),
        insert: (row: Record<string, unknown>) => {
          inserted.push(row)
          return Promise.resolve({ error: answers.insertError })
        },
        upsert: (row: Record<string, unknown>, options: unknown) => {
          upserts.push({ row, options })
          return { select: () => Promise.resolve(answers.keyed) }
        },
        then(
          resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => void
        ) {
          reads.push(table)
          resolve(
            answers.existing === null
              ? { data: null, error: { message: 'connection reset' } }
              : { data: answers.existing, error: null }
          )
        },
      }
      return query
    },
  }
  return { admin: admin as unknown as SupabaseClient<Database>, reads, inserted, upserts }
}

const BASE: Answers = { existing: [], insertError: null, client: null }

describe('notify', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
  afterEach(() => vi.restoreAllMocks())

  it('writes the row and says so', async () => {
    const { admin, reads, inserted } = makeAdmin(BASE)
    const outcome = await notify(admin, {
      agencyId: 'a1',
      type: 'trial_ending',
      message: 'Your trial ends on 27 September — choose a plan to keep generating.',
      cooldownDays: 31,
    })

    expect(outcome).toBe('written')
    expect(reads).toEqual(['notifications'])
    expect(inserted).toEqual([
      {
        agency_id: 'a1',
        client_id: null,
        message: 'Your trial ends on 27 September — choose a plan to keep generating.',
        type: 'trial_ending',
        post_id: null,
        feedback_text: null,
        review_token: null,
      },
    ])
  })

  it('holds an identical sentence back inside the cooldown, and says that too', async () => {
    const { admin, inserted } = makeAdmin({ ...BASE, existing: [{ id: 'n0' }] })
    expect(await notify(admin, { agencyId: 'a1', message: 'same words' })).toBe('suppressed')
    expect(inserted).toEqual([])
  })

  it('skips the cooldown read entirely for an every-time event', async () => {
    const { admin, reads, inserted } = makeAdmin({ ...BASE, existing: [{ id: 'n0' }] })
    expect(
      await notify(admin, { agencyId: 'a1', message: 'again', cooldownDays: NOTIFY_EVERY_TIME })
    ).toBe('written')
    expect(reads).toEqual([])
    expect(inserted).toHaveLength(1)
  })

  it('reports a row it could not write as failed, without throwing', async () => {
    const { admin } = makeAdmin({ ...BASE, insertError: { message: 'permission denied' } })
    expect(await notify(admin, { agencyId: 'a1', message: 'x' })).toBe('failed')
    expect(console.error).toHaveBeenCalledWith('[notify] insert failed:', 'permission denied')
  })

  it('throws when the cooldown cannot be read — silence there would re-notify every tick', async () => {
    const { admin, inserted } = makeAdmin({ ...BASE, existing: null })
    await expect(notify(admin, { agencyId: 'a1', message: 'x' })).rejects.toThrow(
      /cooldown check failed/
    )
    expect(inserted).toEqual([])
  })

  it('resolves the agency and the name from a client, and builds the sentence from it', async () => {
    const { admin, inserted } = makeAdmin({ ...BASE, client: { agency_id: 'a9', name: 'Acme' } })
    const outcome = await notify(admin, {
      clientId: 'c1',
      type: 'posts_ready',
      message: (name) => `3 posts ready to review for ${name}`,
    })

    expect(outcome).toBe('written')
    expect(inserted[0]).toMatchObject({
      agency_id: 'a9',
      client_id: 'c1',
      message: '3 posts ready to review for Acme',
    })
  })

  it('writes a keyed event once in one upsert, reading no cooldown, so two invocations at once cannot both write it', async () => {
    const first = makeAdmin({ ...BASE, keyed: { data: [{ id: 'n1' }], error: null } })
    const input = {
      agencyId: 'a1',
      type: 'trial_ending' as const,
      message: 'Your trial ends on 27 September.',
      dedupKey: 'trial_ending:2026-09-27',
    }
    expect(await notify(first.admin, input)).toBe('written')
    expect(first.reads).toEqual([])
    expect(first.inserted).toEqual([])
    expect(first.upserts).toEqual([
      {
        row: expect.objectContaining({ agency_id: 'a1', dedup_key: 'trial_ending:2026-09-27' }),
        options: { onConflict: 'agency_id,dedup_key', ignoreDuplicates: true },
      },
    ])

    const repeat = makeAdmin({ ...BASE, keyed: { data: [], error: null } })
    expect(await notify(repeat.admin, input)).toBe('suppressed')

    const broken = makeAdmin({ ...BASE, keyed: { data: null, error: { message: 'timeout' } } })
    expect(await notify(broken.admin, input)).toBe('failed')
    expect(console.error).toHaveBeenCalledWith('[notify] insert failed:', 'timeout')
  })

  it('writes nothing for a client that resolves to no agency', async () => {
    const { admin, inserted } = makeAdmin({ ...BASE, client: null })
    expect(await notify(admin, { clientId: 'gone', message: 'x' })).toBe('suppressed')
    expect(inserted).toEqual([])
  })
})
