import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const mocks = vi.hoisted(() => ({
  fetchEditorialPosts: vi.fn(),
  fetchOwedImages: vi.fn(),
  fetchIdeaById: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => ({ requireSessionUser: async () => ({ agencyId: 'a1' }) }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }))
vi.mock('@/lib/queries/cache', () => ({
  getCachedAgencyClients: async () => [{ id: 'c1', posts_per_week: 0 }],
  getCachedAgency: async () => ({ mode: 'agency', timezone: 'Europe/Sofia' }),
  getCachedEntitlement: async () => ({
    canSpend: true,
    state: 'active',
    paymentFailed: false,
    periodKey: '2026-09-01',
    limits: { draft: 100, image: 100, rewrite: 30 },
    timezone: 'Europe/Sofia',
  }),
}))
vi.mock('@/lib/billing/usage', () => ({
  readUsage: async () => ({
    landed: { draft: 0, image: 0, rewrite: 0 },
    committed: { draft: 0, image: 0, rewrite: 0 },
  }),
}))
vi.mock('@/lib/posts/fetch-editorial-posts', () => ({
  fetchEditorialPosts: (...args: unknown[]) => mocks.fetchEditorialPosts(...args),
}))
vi.mock('@/lib/visual/owed-images', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/visual/owed-images')>()),
  fetchOwedImages: (...args: unknown[]) => mocks.fetchOwedImages(...args),
}))
vi.mock('@/lib/generation/runs', () => ({ fetchWaitingRuns: async () => new Map() }))
vi.mock('@/lib/queries/db', () => ({
  fetchClientSourceSummaries: async () => [],
  fetchConnectionsByClient: async () => [],
}))
vi.mock('@/lib/clients/fetch-client-data', () => ({
  buildClientData: async () => ({ id: 'c1' }),
  fetchClientData: async () => ({ data: { id: 'c1' } }),
}))
vi.mock('@/features/ideas/lib/ideas', () => ({
  fetchIdeaById: (...args: unknown[]) => mocks.fetchIdeaById(...args),
}))
vi.mock('@/features/onboarding/lib/require-business-setup', () => ({
  requireBusinessSetup: () => undefined,
}))
vi.mock('@/features/generate/components/generate-flow', () => ({ GenerateFlow: () => null }))

import GeneratePage from '../page'
import { OWED_IMAGES_UNKNOWN } from '@/lib/billing/copy'
import type { PlanGate } from '@/lib/billing/copy'

/** The flow element the page returns for these search params. */
async function flowElement(
  searchParams: { ideaId?: string; client?: string } = {}
): Promise<ReactElement<{ gate: PlanGate; waitingDrafts: unknown[] }>> {
  return GeneratePage({ searchParams: Promise.resolve(searchParams) })
}

/** What the page hands the flow — the gate is the question these cases ask. */
async function flowProps(): Promise<{ gate: PlanGate; waitingDrafts: unknown[] }> {
  return (await flowElement()).props
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.fetchEditorialPosts.mockReset().mockResolvedValue([])
  mocks.fetchOwedImages.mockReset().mockResolvedValue(new Map())
  mocks.fetchIdeaById.mockReset().mockResolvedValue(null)
})

describe('GeneratePage — the pictures earlier posts owe', () => {
  it('offers the form when both reads answer', async () => {
    expect((await flowProps()).gate).toEqual({ refusal: null, wayOut: true })
  })

  it('refuses on an unknown figure when either read fails — an unread figure is not zero — and does not throw', async () => {
    mocks.fetchEditorialPosts.mockRejectedValue(new Error('drafts down'))
    const draftsDown = await flowProps()
    expect(draftsDown.gate).toEqual({ refusal: OWED_IMAGES_UNKNOWN, wayOut: false })
    expect(draftsDown.waitingDrafts).toEqual([])

    mocks.fetchEditorialPosts.mockResolvedValue([])
    mocks.fetchOwedImages.mockRejectedValue(new Error('review queue down'))
    expect((await flowProps()).gate.refusal).toBe(OWED_IMAGES_UNKNOWN)
  })
})

describe('GeneratePage — the flow is keyed on the idea', () => {
  it("keys the flow on the idea's id, and on 'plain' without one, so moving off an idea's run to /generate remounts it", async () => {
    mocks.fetchIdeaById.mockResolvedValue({ id: 'i1', clientId: 'c1', status: 'new' })
    expect((await flowElement({ ideaId: 'i1' })).key).toBe('i1')

    mocks.fetchIdeaById.mockResolvedValue(null)
    expect((await flowElement({ client: 'c1' })).key).toBe('plain')
  })
})
