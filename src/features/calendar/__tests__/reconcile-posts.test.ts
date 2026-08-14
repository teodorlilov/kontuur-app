import { describe, expect, it } from 'vitest'
import { reconcilePosts } from '@/features/calendar/lib/reconcile-posts'
import type { CalendarPost } from '@/types/api'

/**
 * The seam between the server's view of the calendar and the user's.
 *
 * Tested at all because the page refreshes on focus while holding optimistic state, and
 * the two ways to get that wrong are both silent: adopt everything and a mutation still
 * in flight is reverted with no error; adopt nothing and the publish outcomes the cron
 * produced never arrive.
 */
function post(id: string, overrides: Partial<CalendarPost> = {}): CalendarPost {
  return { id, status: 'scheduled', caption: 'server', ...overrides } as CalendarPost
}

describe('reconcilePosts', () => {
  it('takes the server list wholesale when nothing is protected', () => {
    const local = [post('a', { caption: 'local' })]
    const server = [post('a'), post('b')]

    expect(reconcilePosts(local, server, new Set())).toBe(server)
  })

  it('keeps the local version of a protected post', () => {
    const local = [post('a', { caption: 'local edit' })]
    const server = [post('a', { caption: 'server' })]

    const result = reconcilePosts(local, server, new Set(['a']))
    expect(result[0]?.caption).toBe('local edit')
  })

  it('still takes the server version of everything else', () => {
    const local = [post('a', { caption: 'local edit' }), post('b', { caption: 'stale' })]
    const server = [post('a', { caption: 'server' }), post('b', { caption: 'fresh' })]

    const result = reconcilePosts(local, server, new Set(['a']))
    expect(result.map((p) => p.caption)).toEqual(['local edit', 'fresh'])
  })

  it('lets the server add posts even while one is protected', () => {
    // A post generated in another tab, or one the cron published into view.
    const result = reconcilePosts([post('a')], [post('a'), post('b')], new Set(['a']))
    expect(result.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('drops a post the server no longer returns, protected or not', () => {
    // It has left the five statuses this page queries — deleted, archived, or moved
    // back to draft. Keeping it would leave a row on screen that exists nowhere else.
    const result = reconcilePosts([post('a'), post('gone')], [post('a')], new Set(['gone']))
    expect(result.map((p) => p.id)).toEqual(['a'])
  })

  it('falls back to the server row for a protected id it has never seen', () => {
    // The open card can be a post that only just arrived; there is no local version to
    // prefer, and preferring nothing would drop it.
    const result = reconcilePosts([], [post('a', { caption: 'server' })], new Set(['a']))
    expect(result[0]?.caption).toBe('server')
  })
})
