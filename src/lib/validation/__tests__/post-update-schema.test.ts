import { describe, expect, it } from 'vitest'
import { parsePostUpdate, updatePostSchema } from '../post-update-schema'

/**
 * The write contract for `posts`, shared by the server action and `PUT /api/posts/[id]`.
 *
 * Worth testing at all because it replaced two hand-written whitelists that had already
 * drifted from each other — and because `scheduled_at`, the column the entire calendar
 * reads, was previously written with no validation on either path.
 */
describe('updatePostSchema', () => {
  it('is exactly the eleven writable columns', () => {
    // Not decoration. Adding a field here is a decision about what a user may write to
    // a post; this makes it a deliberate edit rather than a line that slips in with a
    // feature. It is also what stops the two consumers diverging again — there is only
    // one list now, so this asserts the list itself.
    expect(Object.keys(updatePostSchema.shape).sort()).toEqual([
      'caption',
      'platform',
      'quality_score_avg',
      'rewrite_count',
      'scheduled_at',
      'slides_json',
      'source_title',
      'source_url',
      'status',
      'validation_json',
      'was_rewritten',
    ])
  })
})

describe('parsePostUpdate', () => {
  it('writes only the keys it was given', () => {
    const result = parsePostUpdate({ caption: 'hello' })
    expect(result).toEqual({ ok: true, updates: { caption: 'hello' } })
  })

  it('drops keys that are not writable rather than rejecting the write', () => {
    // Matches what both call sites did: an unknown key was simply never copied into
    // the payload. Rejecting instead would break any caller sending an extra field.
    const result = parsePostUpdate({ caption: 'hello', agency_id: 'someone-elses' })
    expect(result).toEqual({ ok: true, updates: { caption: 'hello' } })
  })

  it('skips an explicit undefined instead of writing null', () => {
    // Callers spread conditionals into these objects — `...(platform ? { platform } : {})`
    // — so `undefined` must mean "not touching this column", never "clear it".
    const result = parsePostUpdate({ caption: 'hello', platform: undefined })
    expect(result).toEqual({ ok: true, updates: { caption: 'hello' } })
  })

  describe('scheduled_at', () => {
    it('accepts an instant', () => {
      const result = parsePostUpdate({ scheduled_at: '2026-08-14T07:00:00.000Z' })
      expect(result).toEqual({ ok: true, updates: { scheduled_at: '2026-08-14T07:00:00.000Z' } })
    })

    it('accepts an offset form, which is the same instant', () => {
      const result = parsePostUpdate({ scheduled_at: '2026-08-14T10:00:00+03:00' })
      expect(result.ok).toBe(true)
    })

    it('keeps null — that is how a post is unscheduled', () => {
      const result = parsePostUpdate({ scheduled_at: null })
      expect(result).toEqual({ ok: true, updates: { scheduled_at: null } })
    })

    it('rejects a bare date, which names no instant', () => {
      // The regression this whole schema exists for: neither call site checked this, so
      // a wall-clock date with no zone could reach the column the calendar buckets by.
      const result = parsePostUpdate({ scheduled_at: '2026-08-14' })
      expect(result.ok).toBe(false)
    })

    it('rejects a non-date string', () => {
      expect(parsePostUpdate({ scheduled_at: 'next tuesday' }).ok).toBe(false)
    })
  })

  describe('status', () => {
    it('accepts a user-settable status', () => {
      expect(parsePostUpdate({ status: 'scheduled' }).ok).toBe(true)
    })

    it.each(['publishing', 'published', 'failed'])('rejects the pipeline-owned %s', (status) => {
      // These belong to the publish flow. A user setting them corrupts the scheduler's
      // view of what is still to send — which is also why re-arming a failed post needs
      // its own action rather than a widening of this list.
      const result = parsePostUpdate({ status })
      expect(result).toEqual({ ok: false, error: `Invalid status: ${status}` })
    })
  })

  describe('platform', () => {
    it('accepts the display-case name the column stores', () => {
      expect(parsePostUpdate({ platform: 'Instagram' }).ok).toBe(true)
    })

    it('rejects the connection-vocabulary spelling', () => {
      // `isValidPostPlatform` is deliberately exact: accepting 'instagram' is what let a
      // second spelling into the column, after which `platform === 'Instagram'` tests
      // silently failed for those rows.
      expect(parsePostUpdate({ platform: 'instagram' })).toEqual({
        ok: false,
        error: 'Invalid platform: instagram',
      })
    })
  })

  describe('quality_score_avg', () => {
    it('keeps null — "nobody judged this" is a value, not a zero', () => {
      expect(parsePostUpdate({ quality_score_avg: null })).toEqual({
        ok: true,
        updates: { quality_score_avg: null },
      })
    })

    it('rejects a string', () => {
      expect(parsePostUpdate({ quality_score_avg: '8' }).ok).toBe(false)
    })
  })

  it('rejects a body that is not an object', () => {
    expect(parsePostUpdate('caption=hi')).toEqual({ ok: false, error: 'Invalid request body' })
  })
})
