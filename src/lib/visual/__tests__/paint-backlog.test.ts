import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient } from '@/lib/supabase/admin'
import type { EntitledClient } from '@/lib/billing/entitled-clients'
import type { Entitlement } from '@/lib/billing/entitlement'
import type { BacklogPost } from '../visual-backlog'

const mocks = vi.hoisted(() => ({
  readUsageByAgency: vi.fn(),
  fetchImagesByPost: vi.fn(),
  fetchVisualJobs: vi.fn(),
  generatePostVisual: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@/lib/billing/usage', async (importActual) => ({
  AllowanceError: (await importActual<typeof import('@/lib/billing/usage')>()).AllowanceError,
  readUsageByAgency: (...args: unknown[]) => mocks.readUsageByAgency(...args),
  runMetered: (_spender: unknown, fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/posts/fetch-post-images', () => ({
  fetchImagesByPost: (...args: unknown[]) => mocks.fetchImagesByPost(...args),
}))
vi.mock('../visual-jobs', () => ({
  fetchVisualJobs: (...args: unknown[]) => mocks.fetchVisualJobs(...args),
}))
vi.mock('../generate-post-visual', () => ({
  generatePostVisual: (...args: unknown[]) => mocks.generatePostVisual(...args),
}))
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => mocks.notify(...args),
}))

import { AllowanceError } from '@/lib/billing/usage'
import { MAX_CAROUSEL_SLIDES } from '@/utils/constants'
import {
  MAX_IMAGES_PER_RUN,
  paintBacklog,
  ringImagesWaiting,
  selectPaintableBacklog,
} from '../paint-backlog'

const NOW = new Date('2026-09-26T09:00:00Z')

/** An entitlement carrying the fields the painter reads. WHY as: it reads four of them. */
function entitlement(images: number, periodKey = '2026-09-01'): Entitlement {
  return {
    limits: { draft: 100, image: images, rewrite: 30 },
    periodKey,
    resetsOn: new Date('2026-10-01T00:00:00Z'),
    timezone: 'Europe/Sofia',
    paymentFailed: false,
  } as unknown as Entitlement
}

/** Two workspaces: a1 (client c1) with nothing left, a2 (client c2) with plenty. */
const ENTITLED = new Map<string, EntitledClient>([
  ['c1', { agencyId: 'a1', entitlement: entitlement(10) }],
  ['c2', { agencyId: 'a2', entitlement: entitlement(100) }],
])

function post(id: string, clientId: string, minute: number): BacklogPost {
  return {
    id,
    client_id: clientId,
    status: 'pending_review',
    post_type: 'single',
    slides_json: null,
    quality_score_avg: 8,
    visuals_attempts: 0,
    visuals_attempted_at: null,
    created_at: new Date(Date.UTC(2026, 8, 20, 8, minute)).toISOString(),
  }
}

/**
 * The posts table as the backlog read pages it (by `range`), and the attempt writes it takes.
 * WHY as: only the chains the module builds exist.
 */
function postsTable(rows: BacklogPost[]) {
  const pages: Array<[number, number]> = []
  const attempts: Array<{ id: string; visuals_attempts: number }> = []
  const admin = {
    from: () => {
      const read = {
        select: () => read,
        in: () => read,
        eq: () => read,
        lt: () => read,
        or: () => read,
        order: () => read,
        range: (from: number, to: number) => {
          pages.push([from, to])
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
        },
        update: (values: { visuals_attempts: number }) => ({
          eq: (_column: string, id: string) => {
            attempts.push({ id, visuals_attempts: values.visuals_attempts })
            return Promise.resolve({ error: null })
          },
        }),
      }
      return read
    },
  }
  return { admin: admin as unknown as AdminClient, pages, attempts }
}

function usage(images: number) {
  return {
    landed: { draft: 0, image: images, rewrite: 0 },
    committed: { draft: 0, image: images, rewrite: 0 },
  }
}

it('a run can always hold the largest carousel, since a post is painted whole', () => {
  expect(MAX_CAROUSEL_SLIDES).toBeLessThanOrEqual(MAX_IMAGES_PER_RUN)
})

describe('selectPaintableBacklog', () => {
  beforeEach(() => {
    mocks.readUsageByAgency.mockReset().mockResolvedValue(
      new Map([
        ['a1', usage(10)],
        ['a2', usage(0)],
      ])
    )
    mocks.fetchImagesByPost.mockReset().mockResolvedValue(new Map())
    mocks.fetchVisualJobs.mockReset().mockResolvedValue(new Map())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('reads every workspace’s pool in one query', async () => {
    const { admin } = postsTable([post('p1', 'c2', 0)])
    await selectPaintableBacklog(admin, ENTITLED, NOW)
    expect(mocks.readUsageByAgency).toHaveBeenCalledTimes(1)
    expect(mocks.readUsageByAgency).toHaveBeenCalledWith([
      { agencyId: 'a1', periodKey: '2026-09-01' },
      { agencyId: 'a2', periodKey: '2026-09-01' },
    ])
  })

  it('counts a spent workspace’s posts as refused and pages past them to another workspace’s', async () => {
    const spent = Array.from({ length: 100 }, (_, i) => post(`s${i}`, 'c1', i))
    const { admin, pages } = postsTable([...spent, post('ok', 'c2', 200)])
    const backlog = await selectPaintableBacklog(admin, ENTITLED, NOW)
    expect(pages).toEqual([
      [0, 99],
      [100, 199],
    ])
    expect(backlog.jobs).toEqual([{ postId: 'ok', clientId: 'c2', positions: [0] }])
    expect(backlog.refusedByAgency).toEqual(
      new Map([['a1', { posts: 100, entitlement: ENTITLED.get('c1')!.entitlement }]])
    )
  })

  it('pages past posts already painted in full', async () => {
    const painted = Array.from({ length: 100 }, (_, i) => post(`d${i}`, 'c2', i))
    mocks.fetchImagesByPost.mockImplementation(
      async (ids: string[]) =>
        new Map(
          ids
            .filter((id) => id.startsWith('d'))
            .map((id) => [id, [{ position: 0, fileName: 'visual-0.jpg' }]])
        )
    )
    const { admin } = postsTable([...painted, post('late', 'c2', 200)])
    const backlog = await selectPaintableBacklog(admin, ENTITLED, NOW)
    expect(backlog.jobs.map((job) => job.postId)).toEqual(['late'])
  })
})

describe('selectPaintableBacklog — a later page failing', () => {
  beforeEach(() => {
    mocks.readUsageByAgency.mockReset().mockResolvedValue(
      new Map([
        ['a1', usage(10)],
        ['a2', usage(0)],
      ])
    )
    mocks.fetchVisualJobs.mockReset().mockResolvedValue(new Map())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('throws when the first page’s images cannot be read — nothing was read, so nothing can be painted', async () => {
    mocks.fetchImagesByPost
      .mockReset()
      .mockRejectedValueOnce(new Error('post image query failed: timeout'))
    const { admin } = postsTable([post('ok', 'c2', 0)])
    await expect(selectPaintableBacklog(admin, ENTITLED, NOW)).rejects.toThrow('timeout')
  })

  it('keeps what earlier pages picked when a later page’s images cannot be read, and skips the bell, whose count would be short', async () => {
    const spent = Array.from({ length: 100 }, (_, i) => post(`s${i}`, 'c1', i))
    mocks.fetchImagesByPost
      .mockReset()
      .mockResolvedValueOnce(new Map())
      .mockRejectedValueOnce(new Error('post image query failed: timeout'))
    const { admin } = postsTable([post('ok', 'c2', -1), ...spent, post('late', 'c2', 200)])
    const backlog = await selectPaintableBacklog(admin, ENTITLED, NOW)
    expect(backlog.jobs.map((job) => job.postId)).toEqual(['ok'])
    expect(backlog.refusedByAgency).toBeNull()
  })
})

describe('paintBacklog', () => {
  beforeEach(() => {
    mocks.generatePostVisual.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  const backlog = (rows: BacklogPost[]) => ({
    jobs: rows.map((row) => ({ postId: row.id, clientId: row.client_id, positions: [0, 1] })),
    postsById: new Map(rows.map((row) => [row.id, row])),
  })

  it('counts one attempt per post for its own failures, none for a refusal or the clock', async () => {
    const broken = post('broken', 'c2', 0)
    const refused = post('refused', 'c2', 1)
    const late = post('late', 'c2', 2)
    const { admin, attempts } = postsTable([])
    mocks.generatePostVisual.mockImplementation(async ({ postId }: { postId: string }) => {
      if (postId === 'broken') throw new Error('fal timeout')
      if (postId === 'refused') {
        throw new AllowanceError('image', 100, 100, 1, entitlement(100))
      }
      return { ok: true }
    })
    const outcome = await paintBacklog(
      admin,
      backlog([broken, refused]),
      ENTITLED,
      Date.now() + 60_000
    )
    expect(outcome).toMatchObject({ failed: 2, skippedAllowance: 2 })
    expect(attempts).toEqual([{ id: 'broken', visuals_attempts: 1 }])

    const expired = await paintBacklog(admin, backlog([late]), ENTITLED, Date.now() - 1)
    expect(expired.skippedForTime).toBe(2)
    expect(attempts).toHaveLength(1)
  })
})

describe('ringImagesWaiting', () => {
  beforeEach(() => {
    mocks.notify.mockReset().mockResolvedValue('written')
  })

  it('rings once per period, with the count in the message and never in the key', async () => {
    const { admin } = postsTable([])
    const waiting = (posts: number) =>
      new Map([['a1', { posts, entitlement: ENTITLED.get('c1')!.entitlement }]])
    await ringImagesWaiting(admin, waiting(3))
    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify).toHaveBeenCalledWith(admin, {
      agencyId: 'a1',
      type: 'allowance_reached',
      message: expect.stringMatching(/^3 posts in your review queue are waiting for pictures/),
      dedupKey: 'images_waiting:2026-09-01',
    })

    mocks.notify.mockResolvedValue('suppressed')
    await ringImagesWaiting(admin, waiting(5))
    expect(mocks.notify).toHaveBeenLastCalledWith(
      admin,
      expect.objectContaining({ dedupKey: 'images_waiting:2026-09-01' })
    )
  })
})
