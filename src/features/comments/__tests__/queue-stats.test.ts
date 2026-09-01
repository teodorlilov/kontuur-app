import { describe, expect, it } from 'vitest'
import { computeQueueStats, formatDuration } from '../lib/queue-stats'
import type { CommentGroup, QueuedComment } from '@/types/api'

/**
 * The header's numbers.
 *
 * Every one is counted from the rows already on screen, so a header that says
 * "7 need a reply" above six of them is impossible by construction. These tests
 * exist to keep it that way.
 */

const NOW = new Date('2026-09-01T12:00:00Z')

function comment(over: Partial<QueuedComment> = {}): QueuedComment {
  return {
    id: 'c1',
    authorUsername: 'maria.kx',
    text: 'A question',
    commentedAt: '2026-09-01T10:00:00Z',
    likeCount: null,
    hidden: false,
    status: 'needs_reply',
    replies: [],
    ...over,
  }
}

function group(comments: QueuedComment[]): CommentGroup {
  return {
    igMediaId: 'media-1',
    postId: 'post-1',
    clientId: 'client-1',
    clientName: 'Haelan',
    caption: null,
    pillar: null,
    publishedAt: null,
    imageUrl: null,
    permalink: null,
    comments,
  }
}

describe('computeQueueStats', () => {
  it('counts each status separately', () => {
    const stats = computeQueueStats(
      [
        group([
          comment({ id: 'a' }),
          comment({ id: 'b', status: 'answered' }),
          comment({ id: 'c', status: 'hidden', hidden: true }),
          comment({ id: 'd' }),
        ]),
      ],
      NOW
    )

    expect(stats).toMatchObject({ needsReply: 2, answered: 1, hidden: 1 })
  })

  it('reports the longest wait, not the most recent', () => {
    const stats = computeQueueStats(
      [
        group([
          comment({ id: 'a', commentedAt: '2026-09-01T11:00:00Z' }),
          comment({ id: 'b', commentedAt: '2026-08-30T12:00:00Z' }),
        ]),
      ],
      NOW
    )

    // Two days, from the older one. The recent comment must not mask it.
    expect(stats.oldestWaitingMs).toBe(2 * 86_400_000)
  })

  it('ignores answered comments when measuring the wait', () => {
    const stats = computeQueueStats(
      [
        group([
          comment({
            id: 'a',
            status: 'answered',
            commentedAt: '2026-08-01T12:00:00Z',
            replies: [
              { id: 'r', authorUsername: 'us', text: 'hi', commentedAt: null, fromUs: true },
            ],
          }),
        ]),
      ],
      NOW
    )

    expect(stats.oldestWaitingMs).toBeNull()
  })

  it('measures reply time from the FIRST of our replies', () => {
    // A thread we came back to twice was still answered once; taking the last
    // reply would punish a conversation for continuing.
    const stats = computeQueueStats(
      [
        group([
          comment({
            status: 'answered',
            commentedAt: '2026-09-01T10:00:00Z',
            replies: [
              {
                id: 'r2',
                authorUsername: 'us',
                text: 'and also',
                commentedAt: '2026-09-01T11:00:00Z',
                fromUs: true,
              },
              {
                id: 'r1',
                authorUsername: 'us',
                text: 'yes',
                commentedAt: '2026-09-01T10:30:00Z',
                fromUs: true,
              },
            ],
          }),
        ]),
      ],
      NOW
    )

    expect(stats.medianReplyMs).toBe(30 * 60_000)
  })

  it('ignores replies that are not ours when measuring reply time', () => {
    const stats = computeQueueStats(
      [
        group([
          comment({
            status: 'answered',
            commentedAt: '2026-09-01T10:00:00Z',
            replies: [
              {
                id: 'r',
                authorUsername: 'someone.else',
                text: 'me too',
                commentedAt: '2026-09-01T10:05:00Z',
                fromUs: false,
              },
            ],
          }),
        ]),
      ],
      NOW
    )

    expect(stats.medianReplyMs).toBeNull()
  })

  it('takes a median, so one very late reply does not move the number much', () => {
    const answered = (askedAt: string, repliedAt: string, id: string) =>
      comment({
        id,
        status: 'answered',
        commentedAt: askedAt,
        replies: [
          { id: `${id}-r`, authorUsername: 'us', text: 'ok', commentedAt: repliedAt, fromUs: true },
        ],
      })

    const stats = computeQueueStats(
      [
        group([
          answered('2026-09-01T10:00:00Z', '2026-09-01T11:00:00Z', 'a'), // 1h
          answered('2026-09-01T10:00:00Z', '2026-09-01T12:00:00Z', 'b'), // 2h
          answered('2026-08-01T10:00:00Z', '2026-08-15T10:00:00Z', 'c'), // 14 days
        ]),
      ],
      NOW
    )

    // A mean would report roughly four days. The median says two hours, which is
    // what almost every reply actually took.
    expect(stats.medianReplyMs).toBe(2 * 3_600_000)
  })
})

describe('formatDuration', () => {
  it('coarsens to the unit someone reasons about', () => {
    expect(formatDuration(90_000)).toBe('2m')
    expect(formatDuration(3 * 3_600_000)).toBe('3h')
    expect(formatDuration(86_400_000)).toBe('1 day')
    expect(formatDuration(2 * 86_400_000)).toBe('2 days')
  })

  it('never rounds a real wait down to zero', () => {
    expect(formatDuration(5_000)).toBe('1m')
  })
})
