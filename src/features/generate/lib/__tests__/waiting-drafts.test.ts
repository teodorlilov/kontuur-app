import { describe, expect, it } from 'vitest'
import { groupWaitingDrafts } from '../waiting-drafts'
import type { EditorialPost } from '@/lib/posts/fetch-editorial-posts'
import type { WaitingRun } from '@/lib/generation/runs'

/**
 * A group is a RUN. It used to be a guess — client plus format — which gave the right answer only
 * because one run writes one format, and had no way to carry what that run asked for.
 */

function item(
  id: string,
  over: { clientId?: string; runId?: string | null; postType?: string } = {}
): EditorialPost {
  return {
    post: {
      id,
      client_id: over.clientId ?? 'c1',
      post_type: over.postType ?? 'single',
      generation_run_id: over.runId ?? null,
    },
  } as unknown as EditorialPost
}

const RUN_A: WaitingRun = { targetCount: 4, skipped: { names: ['Behind the scenes'], cost: 1 } }
const RUN_B: WaitingRun = { targetCount: 2, skipped: null }

describe('groupWaitingDrafts', () => {
  it('splits two runs of one client, each carrying its own run', () => {
    const groups = groupWaitingDrafts(
      [item('a', { runId: 'run-a' }), item('b', { runId: 'run-b' }), item('c', { runId: 'run-a' })],
      new Map([
        ['run-a', RUN_A],
        ['run-b', RUN_B],
      ])
    )

    expect(groups.map((g) => g.posts.map((p) => p.post.id))).toEqual([['a', 'c'], ['b']])
    expect(groups[0]?.run).toEqual(RUN_A)
    expect(groups[1]?.run).toEqual(RUN_B)
  })

  it('a run whose row is gone still groups — there is just nothing to say about it', () => {
    const groups = groupWaitingDrafts([item('a', { runId: 'run-a' })], new Map())

    expect(groups).toHaveLength(1)
    expect(groups[0]?.run).toBeNull()
  })

  it('falls back to client and format for a draft written without a run', () => {
    const groups = groupWaitingDrafts(
      [item('a'), item('b', { postType: 'carousel' }), item('c', { clientId: 'c2' }), item('d')],
      new Map()
    )

    expect(groups.map((g) => g.posts.map((p) => p.post.id))).toEqual([['a', 'd'], ['b'], ['c']])
    expect(groups.every((g) => g.run === null)).toBe(true)
  })
})
