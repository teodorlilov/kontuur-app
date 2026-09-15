import { describe, expect, it } from 'vitest'
import type { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { fetchEntitledClients } from '../entitled-clients'

const NOW_PLUS = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

/** Three agencies: a live trial, one in its grace (publishes, cannot spend), one long paused. */
const AGENCIES = [
  { id: 'live', timezone: 'UTC', plan: 'trial', mode: 'agency', trial_ends_at: NOW_PLUS(5) },
  { id: 'grace', timezone: 'UTC', plan: 'trial', mode: 'agency', trial_ends_at: NOW_PLUS(-2) },
  { id: 'paused', timezone: 'UTC', plan: 'trial', mode: 'agency', trial_ends_at: NOW_PLUS(-40) },
].map((row) => ({
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: null,
  subscription_quantity: null,
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  past_due_since: null,
  ...row,
}))

const CLIENTS = [
  { id: 'c-live', agency_id: 'live' },
  { id: 'c-grace', agency_id: 'grace' },
  { id: 'c-paused', agency_id: 'paused' },
]

/**
 * A recorder in place of the admin client: every query resolves to the fixture for its table and
 * the `.in()` filter is applied so the clients read returns only what the real one would. Cast
 * through `unknown` because only `from/select/in` exist — the three the roster calls; a new query
 * method fails at runtime, which is the intent.
 */
function makeAdmin() {
  const reads: string[] = []
  const admin = {
    from(table: string) {
      reads.push(table)
      let ids: string[] | null = null
      const query = {
        select: () => query,
        in: (_column: string, values: string[]) => {
          ids = values
          return query
        },
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          const data =
            table === 'agencies'
              ? AGENCIES
              : CLIENTS.filter((client) => ids === null || ids.includes(client.agency_id))
          resolve({ data, error: null })
        },
      }
      return query
    },
  }
  return { admin: admin as unknown as ReturnType<typeof createAdminSupabaseClient>, reads }
}

describe('fetchEntitledClients', () => {
  it('reads every agency once and the entitled ones’ clients once', async () => {
    const { admin, reads } = makeAdmin()
    const entitled = await fetchEntitledClients(admin, 'spend')

    expect(reads).toEqual(['agencies', 'clients'])
    expect([...entitled.keys()]).toEqual(['c-live'])
    expect(entitled.get('c-live')?.agencyId).toBe('live')
    expect(entitled.get('c-live')?.entitlement.state).toBe('trial')
  })

  it('a grace workspace may publish but not spend', async () => {
    const { admin } = makeAdmin()
    const publishers = await fetchEntitledClients(admin, 'publish')
    expect([...publishers.keys()].sort()).toEqual(['c-grace', 'c-live'])
  })

  it('skips the clients read entirely when no agency is entitled', async () => {
    const { admin, reads } = makeAdmin()
    const creators = await fetchEntitledClients(admin, 'create')
    expect([...creators.keys()]).toEqual(['c-live'])
    expect(reads).toEqual(['agencies', 'clients'])

    const none = makeAdmin()
    AGENCIES.forEach((row) => (row.trial_ends_at = NOW_PLUS(-40)))
    expect((await fetchEntitledClients(none.admin, 'publish')).size).toBe(0)
    expect(none.reads).toEqual(['agencies'])
  })
})
