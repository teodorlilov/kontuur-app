import { describe, expect, it } from 'vitest'
import {
  failedPublications,
  firstFailureReason,
  postDisplayState,
  publishStateOf,
  toPublicationSummary,
  type PublicationStatus,
  type PublicationSummary,
} from '../publish-state'

/**
 * The one definition of "did this go out", and now the busiest function in the app.
 *
 * Eight surfaces reduce a post's destinations through it — the calendar card and its grid, the
 * week model, the dashboard's coverage row, the upcoming list, the scheduled-this-week count,
 * the publish watcher and the move guard. It had no tests at all while every one of those was
 * being rewritten to depend on it, which is the wrong way round: its precedence rules are pure
 * logic with real branching, and a change to them is silent everywhere at once.
 *
 * The rules being pinned, in the order the function applies them: any destination still in
 * flight makes the whole post 'publishing'; all of them live is 'published'; some live is
 * 'partly'; none live but one failed is 'failed'; anything else has not gone out.
 */

function publication(
  status: PublicationStatus,
  over: Partial<PublicationSummary> = {}
): PublicationSummary {
  return {
    id: `pub-${status}-${over.platform ?? 'instagram'}`,
    platform: 'instagram',
    status,
    publishedAt: status === 'published' ? '2026-09-01T09:00:00.000Z' : null,
    publishError: status === 'failed' ? 'Token expired' : null,
    ...over,
  }
}

describe('publishStateOf', () => {
  it('is unpublished when a post has no destinations at all', () => {
    // A draft, or a post scheduled for a client with no connected account. Not a failure —
    // nothing has been asked of any network yet.
    expect(publishStateOf([])).toBe('unpublished')
  })

  it('is unpublished while every destination is only queued', () => {
    expect(publishStateOf([publication('scheduled'), publication('scheduled')])).toBe('unpublished')
  })

  it('is published only when every destination is live', () => {
    expect(publishStateOf([publication('published')])).toBe('published')
    expect(publishStateOf([publication('published'), publication('published')])).toBe('published')
  })

  it('is partly when one network took it and another has not', () => {
    // The outcome the whole table exists for: live somewhere, needing attention somewhere else.
    // Collapsing it either way loses one of those two facts.
    expect(publishStateOf([publication('published'), publication('failed')])).toBe('partly')
    expect(publishStateOf([publication('published'), publication('scheduled')])).toBe('partly')
  })

  it('is failed only when nothing went out and something gave up', () => {
    expect(publishStateOf([publication('failed')])).toBe('failed')
    expect(publishStateOf([publication('failed'), publication('scheduled')])).toBe('failed')
  })

  it('lets a destination still in flight outrank every other answer', () => {
    // Deliberate precedence: something is happening right now, and that is what a person needs
    // to know before they act. It outranks even a sibling that has already failed.
    expect(publishStateOf([publication('publishing'), publication('failed')])).toBe('publishing')
    expect(publishStateOf([publication('publishing'), publication('published')])).toBe('publishing')
  })

  it('does not care what order the destinations arrive in', () => {
    // They come off an embed with no ORDER BY, so the answer must not depend on the row order.
    const mixed = [publication('failed'), publication('published'), publication('scheduled')]
    expect(publishStateOf(mixed)).toBe('partly')
    expect(publishStateOf([...mixed].reverse())).toBe('partly')
  })
})

describe('postDisplayState', () => {
  it('shows the editorial status while nothing has gone out', () => {
    expect(postDisplayState('draft', [])).toBe('draft')
    expect(postDisplayState('scheduled', [publication('scheduled')])).toBe('scheduled')
  })

  it('lets the publish state win the moment there is one', () => {
    // A post whose media is live on Instagram reads 'published', never 'scheduled' — saying
    // "Scheduled" over something already out is the more wrong of the two answers. This matters
    // more than it looks: posts.status stays 'scheduled' for the whole of a post's published
    // life, so without this every live post would render as still-to-come.
    expect(postDisplayState('scheduled', [publication('published')])).toBe('published')
    expect(postDisplayState('scheduled', [publication('failed')])).toBe('failed')
    expect(postDisplayState('scheduled', [publication('publishing')])).toBe('publishing')
    expect(postDisplayState('scheduled', [publication('published'), publication('failed')])).toBe(
      'partly'
    )
  })
})

describe('failedPublications and firstFailureReason', () => {
  it('names only the destinations a person has to act on', () => {
    const failed = failedPublications([
      publication('published'),
      publication('failed', { platform: 'facebook' }),
    ])
    expect(failed.map((p) => p.platform)).toEqual(['facebook'])
  })

  it('has no reason to give when nothing failed', () => {
    expect(firstFailureReason([publication('published')])).toBeNull()
    expect(firstFailureReason([])).toBeNull()
  })

  it('skips a failed destination that recorded no message', () => {
    // The write that records a failure can itself be lost, leaving the status without its
    // reason. A later destination that DID record one is the more useful answer than null.
    expect(
      firstFailureReason([
        publication('failed', { publishError: null }),
        publication('failed', { publishError: 'Media download failed' }),
      ])
    ).toBe('Media download failed')
  })

  it('ignores a message left on a destination that is not failed', () => {
    // A non-final failure re-arms the row to 'scheduled' and KEEPS its message, so a stale
    // reason sits on a destination that is queued to try again. This surface answers "what
    // finally killed it", so that message is not its answer.
    expect(
      firstFailureReason([publication('scheduled', { publishError: 'Timed out, retrying' })])
    ).toBeNull()
  })
})

describe('toPublicationSummary', () => {
  it('renames the row once, so no caller has to know the column names', () => {
    expect(
      toPublicationSummary({
        id: 'pub-1',
        platform: 'instagram',
        status: 'published',
        published_at: '2026-09-01T09:00:00.000Z',
        publish_error: null,
      })
    ).toEqual({
      id: 'pub-1',
      platform: 'instagram',
      status: 'published',
      publishedAt: '2026-09-01T09:00:00.000Z',
      publishError: null,
    })
  })

  it('feeds publishStateOf directly, which is the only reason it exists', () => {
    const rows = [
      {
        id: 'a',
        platform: 'instagram',
        status: 'published',
        published_at: 'x',
        publish_error: null,
      },
      {
        id: 'b',
        platform: 'facebook',
        status: 'failed',
        published_at: null,
        publish_error: 'nope',
      },
    ]
    expect(publishStateOf(rows.map(toPublicationSummary))).toBe('partly')
  })
})
