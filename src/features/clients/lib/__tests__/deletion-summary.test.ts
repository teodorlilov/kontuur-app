import { describe, expect, it } from 'vitest'
import { buildDeletionSummary } from '../deletion-summary'

/**
 * The copy inside an irreversible confirm dialog.
 *
 * Worth pinning because both failure modes are silent: a plural bug ("1 sources") is the
 * classic embarrassment in the one place the reader is being asked to slow down and read, and
 * a zero-count group that renders anyway ("0 connected accounts") pads the list until the
 * items that actually matter stop being read at all.
 */
const NONE = {
  publishedCount: 0,
  pendingCount: 0,
  scheduledCount: 0,
  sourceCount: 0,
  connectionCount: 0,
  ideaCount: 0,
}

describe('buildDeletionSummary', () => {
  it('says nothing about what the client does not have', () => {
    expect(buildDeletionSummary(NONE)).toEqual([])
    expect(buildDeletionSummary({ ...NONE, sourceCount: 2 })).toEqual(['2 sources'])
  })

  it('agrees with its own numbers', () => {
    expect(buildDeletionSummary({ ...NONE, publishedCount: 1 })).toEqual(['1 published post'])
    expect(buildDeletionSummary({ ...NONE, publishedCount: 2 })).toEqual(['2 published posts'])
    expect(buildDeletionSummary({ ...NONE, connectionCount: 1 })).toEqual(['1 connected account'])
    expect(buildDeletionSummary({ ...NONE, connectionCount: 2 })).toEqual(['2 connected accounts'])
  })

  it('lists every group that has something in it, worst first', () => {
    expect(
      buildDeletionSummary({
        publishedCount: 12,
        pendingCount: 3,
        scheduledCount: 1,
        sourceCount: 5,
        connectionCount: 1,
        ideaCount: 4,
      })
    ).toEqual([
      '12 published posts',
      '3 posts awaiting review',
      '1 scheduled post',
      '5 sources',
      '1 connected account',
      '4 client ideas',
    ])
  })
})
