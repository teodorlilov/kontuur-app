import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GraphApiError } from '@/lib/meta/graph-errors'

const mocks = vi.hoisted(() => ({
  retireConnection: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@/lib/meta/connection-store', () => ({ retireConnection: mocks.retireConnection }))
vi.mock('@/lib/notifications/notify', () => ({ notify: mocks.notify }))

import { syncRoster } from '../shared/sync-shared'

function graphError(code: number, message: string): GraphApiError {
  return new GraphApiError({
    httpStatus: 400,
    code,
    subcode: null,
    type: 'OAuthException',
    message,
    fbtraceId: null,
  })
}

/** One live Instagram connection; every health stamp is recorded so the test can read it. */
function fakeAdmin() {
  const health: Array<Record<string, unknown>> = []
  const select = vi.fn(() => ({
    eq: () => ({
      not: () => ({
        not: () =>
          Promise.resolve({
            data: [
              { client_id: 'c1', platform: 'instagram', account_id: 'acct', access_token: 'tok' },
            ],
            error: null,
          }),
      }),
    }),
  }))
  const update = vi.fn((values: Record<string, unknown>) => {
    health.push(values)
    return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
  })
  const client = { from: vi.fn(() => ({ select, update })) } as unknown as SupabaseClient
  return { client, health }
}

const OPTIONS = { platform: 'instagram', networkLabel: 'Instagram', timeBudgetMs: 10_000 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.retireConnection.mockResolvedValue(undefined)
  mocks.notify.mockResolvedValue(undefined)
})

describe('syncRoster on a dead token', () => {
  it("retires the connection with Meta's own message, and still stamps the failure", async () => {
    const { client, health } = fakeAdmin()
    const outcome = await syncRoster(client, {
      ...OPTIONS,
      syncOne: () => Promise.reject(graphError(190, 'Error validating access token')),
    })

    expect(outcome.failed).toBe(1)
    expect(mocks.retireConnection).toHaveBeenCalledWith(client, {
      clientId: 'c1',
      platform: 'instagram',
      reason: 'Error validating access token',
    })
    expect(health.at(-1)?.last_sync_error).toBe('Error validating access token')
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('does NOT retire on a permission answer — the token still publishes', async () => {
    const { client } = fakeAdmin()
    await syncRoster(client, {
      ...OPTIONS,
      syncOne: () => Promise.reject(graphError(10, 'missing permission')),
    })

    expect(mocks.retireConnection).not.toHaveBeenCalled()
    expect(mocks.notify).toHaveBeenCalledTimes(1)
  })

  it('records a retire that did not land under its own name, not as a notification failure', async () => {
    mocks.retireConnection.mockRejectedValue(new Error('retire failed for client c1: boom'))
    const { client } = fakeAdmin()
    const outcome = await syncRoster(client, {
      ...OPTIONS,
      syncOne: () => Promise.reject(graphError(190, 'dead')),
    })

    expect(outcome.errors).toContainEqual({
      clientId: 'c1',
      error: 'retire failed: retire failed for client c1: boom',
    })
  })
})
