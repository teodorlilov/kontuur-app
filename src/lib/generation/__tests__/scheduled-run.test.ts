import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient } from '@/lib/supabase/admin'
import type { Entitlement } from '@/lib/billing/entitlement'

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  startGenerationRun: vi.fn(),
  fetchClientData: vi.fn(),
}))
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => mocks.notify(...args),
  NOTIFY_EVERY_TIME: 0,
}))
vi.mock('@/lib/generation/runs', () => ({
  startGenerationRun: (...args: unknown[]) => mocks.startGenerationRun(...args),
  finishGenerationRun: vi.fn(),
  trackGenerationTheme: vi.fn(),
}))
vi.mock('@/lib/clients/fetch-client-data', () => ({
  fetchClientData: (...args: unknown[]) => mocks.fetchClientData(...args),
}))
vi.mock('@/lib/queries/db', () => ({ fetchEngineContext: vi.fn() }))
vi.mock('@/ai/generation/generation-orchestrator', () => ({ runGenerationBatch: vi.fn() }))
vi.mock('@/ai/generation/to-theme', () => ({ toTheme: vi.fn() }))
vi.mock('@/ai/research/research-orchestrator', () => ({ performResearch: vi.fn() }))
vi.mock('@/ai/learning/distill-style-memo', () => ({ distillStyleMemo: vi.fn() }))
vi.mock('@/lib/generation/draft-posts', () => ({ insertDraftPosts: vi.fn() }))

import { runScheduledBatch } from '../scheduled-run'
import { createAgencyBudgets } from '../scheduled-budget'

/** The paid plan's pool for one brand. WHY as: the batch reads four fields of the entitlement. */
const ENTITLEMENT = {
  limits: { draft: 25, image: 105, rewrite: 15 },
  periodKey: '2026-09-01',
  resetsOn: new Date('2026-10-01T00:00:00Z'),
  timezone: 'Europe/Sofia',
  paymentFailed: false,
} as unknown as Entitlement

/** WHY as: every batch here stops before a query of its own, so no client method is reached. */
const ADMIN = {} as AdminClient

describe('runScheduledBatch — the exhausted bell', () => {
  beforeEach(() => {
    mocks.notify.mockReset().mockResolvedValue('written')
    mocks.startGenerationRun.mockReset()
  })

  it('names the owed pictures, measured on one post rather than the whole ask, when they are why a schedule of carousels could not run', async () => {
    const budgets = createAgencyBudgets(
      new Map([
        [
          'a1',
          {
            limits: ENTITLEMENT.limits,
            committed: { draft: 10, image: 93, rewrite: 0 },
            owed: { posts: 3, images: 12 },
          },
        ],
      ])
    )
    const outcome = await runScheduledBatch(ADMIN, {
      schedule: { client_id: 'c1', frequency_value: 3 },
      client: { id: 'c1', agency_id: 'a1', name: 'One' },
      scheduledAt: new Date('2026-09-26T09:00:00Z'),
      entitlement: ENTITLEMENT,
      brandProfile: { default_post_type: 'carousel', default_carousel_slides: 5 },
      budgets,
      deadline: Date.now() + 60_000,
    })

    expect(outcome).toEqual({ kind: 'over_allowance' })
    expect(mocks.startGenerationRun).not.toHaveBeenCalled()
    expect(mocks.notify).toHaveBeenCalledWith(ADMIN, {
      agencyId: 'a1',
      clientId: 'c1',
      type: 'allowance_reached',
      message: expect.stringMatching(
        /^3 posts still waiting for pictures need 12 AI images; you have 12 left this period\. Resets on /
      ),
      dedupKey: 'allowance_reached:2026-09-01:image:105',
    })
  })

  it('names a sibling’s batch claimed this tick as waiting, and what is really left', async () => {
    const budgets = createAgencyBudgets(
      new Map([
        [
          'a1',
          {
            limits: ENTITLEMENT.limits,
            committed: { draft: 5, image: 80, rewrite: 0 },
            owed: { posts: 1, images: 5 },
          },
        ],
      ])
    )
    budgets.take('a1', 4, 5)
    const outcome = await runScheduledBatch(ADMIN, {
      schedule: { client_id: 'c2', frequency_value: 1 },
      client: { id: 'c2', agency_id: 'a1', name: 'Two' },
      scheduledAt: new Date('2026-09-26T09:00:00Z'),
      entitlement: ENTITLEMENT,
      brandProfile: { default_post_type: 'carousel', default_carousel_slides: 5 },
      budgets,
      deadline: Date.now() + 60_000,
    })

    expect(outcome).toEqual({ kind: 'over_allowance' })
    expect(mocks.notify).toHaveBeenCalledWith(
      ADMIN,
      expect.objectContaining({
        message: expect.stringMatching(
          /^5 posts still waiting for pictures need 25 AI images; you have 25 left this period\./
        ),
      })
    )
  })

  it('reports a client that could not be read as an error, and claims no slot', async () => {
    mocks.fetchClientData.mockResolvedValue({ error: 'Could not load the client: timeout' })
    const budgets = createAgencyBudgets(
      new Map([
        [
          'a1',
          {
            limits: ENTITLEMENT.limits,
            committed: { draft: 0, image: 0, rewrite: 0 },
            owed: { posts: 0, images: 0 },
          },
        ],
      ])
    )
    const outcome = await runScheduledBatch(ADMIN, {
      schedule: { client_id: 'c1', frequency_value: 1 },
      client: { id: 'c1', agency_id: 'a1', name: 'One' },
      scheduledAt: new Date('2026-09-26T09:00:00Z'),
      entitlement: ENTITLEMENT,
      brandProfile: null,
      budgets,
      deadline: Date.now() + 60_000,
    })

    expect(outcome).toEqual({ kind: 'error', error: 'Could not load the client: timeout' })
    expect(mocks.startGenerationRun).not.toHaveBeenCalled()
  })
})
