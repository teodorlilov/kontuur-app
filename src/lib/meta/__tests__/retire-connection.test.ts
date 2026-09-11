import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@/lib/notifications/notify', () => ({ notify: mocks.notify }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))

import { retireConnection } from '../connection-store'

/** Records the update payload and the two filters, in the order supabase-js chains them. */
function fakeAdmin(updateError: { message: string } | null = null) {
  const patches: Array<Record<string, unknown>> = []
  const filters: Array<[string, string]> = []
  const update = vi.fn((values: Record<string, unknown>) => {
    patches.push(values)
    return {
      eq: (column: string, value: string) => {
        filters.push([column, value])
        return {
          eq: (column2: string, value2: string) => {
            filters.push([column2, value2])
            return Promise.resolve({ error: updateError })
          },
        }
      },
    }
  })
  const client = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient
  return { client, patches, filters }
}

const DEAD = 'Error validating access token: the session has been invalidated'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.notify.mockResolvedValue(undefined)
})

describe('retireConnection', () => {
  it('nulls the token, stamps why and when, busts the client caches, then tells the agency', async () => {
    const { client, patches, filters } = fakeAdmin()
    await retireConnection(client, { clientId: 'c1', platform: 'instagram', reason: DEAD })

    expect(patches).toHaveLength(1)
    const values = patches[0]!
    expect(values.access_token).toBeNull()
    expect(values.retired_reason).toBe(DEAD)
    expect(typeof values.retired_at).toBe('string')
    expect(filters).toEqual([
      ['client_id', 'c1'],
      ['platform', 'instagram'],
    ])

    expect(mocks.revalidateTag).toHaveBeenCalledWith('agency-clients', { expire: 0 })
    expect(mocks.revalidateTag.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.notify.mock.invocationCallOrder[0]!
    )

    expect(mocks.notify).toHaveBeenCalledTimes(1)
    const input = mocks.notify.mock.calls[0]![1] as {
      clientId: string
      type: string
      cooldownDays: number
      message: (name: string) => string
    }
    expect(input.clientId).toBe('c1')
    expect(input.type).toBe('connection_retired')
    expect(input.cooldownDays).toBe(1)
    expect(input.message('Acme')).toBe('Instagram for Acme stopped working — reconnect the account')
  })

  it('names the network the platform column stores, for either network', async () => {
    const { client } = fakeAdmin()
    await retireConnection(client, { clientId: 'c1', platform: 'facebook', reason: DEAD })
    const input = mocks.notify.mock.calls[0]![1] as { message: (name: string) => string }
    expect(input.message('Acme')).toBe('Facebook for Acme stopped working — reconnect the account')
  })

  it('throws when the row could not be written, before any side effect', async () => {
    const { client } = fakeAdmin({ message: 'boom' })
    await expect(
      retireConnection(client, { clientId: 'c1', platform: 'instagram', reason: DEAD })
    ).rejects.toThrow('boom')
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('propagates a failed notification only after the retirement has landed', async () => {
    mocks.notify.mockRejectedValue(new Error('cooldown check failed'))
    const { client, patches } = fakeAdmin()
    await expect(
      retireConnection(client, { clientId: 'c1', platform: 'instagram', reason: DEAD })
    ).rejects.toThrow('cooldown check failed')
    expect(patches).toHaveLength(1)
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
  })
})
