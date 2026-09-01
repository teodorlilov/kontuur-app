import { describe, expect, it } from 'vitest'
import { commentStatus, countNeedingReply, isOurs } from '../lib/comment-status'
import type { CommentStatus } from '@/types/api'

/**
 * "Has this been dealt with" is derived, never stored, and this is the only place
 * that decides it. The queue's tabs and the sidebar badge both go through here,
 * which is what stops them disagreeing — so a bug in this file is a bug on two
 * surfaces at once.
 */

describe('commentStatus', () => {
  it('needs a reply when nobody has answered', () => {
    expect(commentStatus({ hidden: false }, [], 'haelanclinic')).toBe('needs_reply')
  })

  it('is answered when a reply carries the connected handle', () => {
    expect(
      commentStatus({ hidden: false }, [{ authorUsername: 'haelanclinic' }], 'haelanclinic')
    ).toBe('answered')
  })

  it('is NOT answered when the reply came from someone else', () => {
    // Another commenter replying in the thread is a conversation, not an answer.
    expect(commentStatus({ hidden: false }, [{ authorUsername: 'maria.kx' }], 'haelanclinic')).toBe(
      'needs_reply'
    )
  })

  it('is hidden even when we also replied — moderation is the later decision', () => {
    expect(
      commentStatus({ hidden: true }, [{ authorUsername: 'haelanclinic' }], 'haelanclinic')
    ).toBe('hidden')
  })

  it('needs a reply when the connection has no handle at all', () => {
    // Without a handle there is no way to recognise our own reply, and guessing
    // "answered" would bury a real question.
    expect(commentStatus({ hidden: false }, [{ authorUsername: 'someone' }], null)).toBe(
      'needs_reply'
    )
  })
})

describe('isOurs', () => {
  it('matches case-insensitively, because the two sides come from different places', () => {
    // Instagram returns lowercase usernames; account_name falls back to the DISPLAY
    // name at connect time. An exact match would file every one of our own replies
    // as unanswered for any account that took that fallback.
    expect(isOurs('haelanclinic', 'HaelanClinic')).toBe(true)
  })

  it('never matches on a missing side', () => {
    // A null author means Advanced Access is missing and Instagram withheld it —
    // exactly the case where we must not guess that it was us.
    expect(isOurs(null, 'haelanclinic')).toBe(false)
    expect(isOurs('haelanclinic', null)).toBe(false)
  })
})

describe('countNeedingReply', () => {
  it('counts across every group, which is what the badge shows', () => {
    const group = (...statuses: CommentStatus[]) => ({
      comments: statuses.map((status) => ({ status })),
    })

    expect(
      countNeedingReply([
        group('needs_reply', 'answered', 'needs_reply'),
        group('hidden'),
        group('needs_reply'),
      ])
    ).toBe(3)
  })
})
