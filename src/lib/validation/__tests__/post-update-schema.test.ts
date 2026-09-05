import { describe, expect, it } from 'vitest'
import { parsePostUpdate, postCopySchema, updatePostSchema } from '../post-update-schema'

/**
 * The write contract for `posts`, owned by the `updatePost` server action.
 *
 * Worth testing at all because it replaced two hand-written whitelists that had already
 * drifted from each other — and because `scheduled_at`, the column the entire calendar
 * reads, was previously written with no validation on either path.
 */
describe('updatePostSchema', () => {
  it('is exactly the two columns its callers send', () => {
    // Not decoration. Whitelisting a column here GRANTS a way to write it, so adding one is a
    // decision about who owns that column — a deliberate edit, not a line that slips in with a
    // feature. Six fields sat here with no caller at all until 2026-08-31, on columns the create
    // path and persistRewrite already owned: a second writer that had not been written yet.
    expect(Object.keys(updatePostSchema.shape).sort()).toEqual(['scheduled_at', 'status'])
  })

  it('does not accept a post\u2019s copy — savePostCopy owns those two columns', () => {
    // caption and slides_json were here, and three actions wrote them: updatePost through this
    // schema, savePostCopy through a hand-written duplicate of the same two fields, and a PUT
    // route restating the whole contract. The review queue used two of the three in ONE editing
    // session — savePostCopy on every autosave flush, updatePost on approve — so the same columns
    // were written under two schemas depending on whether the user was typing or finishing.
    const keys = Object.keys(updatePostSchema.shape)
    expect(keys).not.toContain('caption')
    expect(keys).not.toContain('slides_json')
    // And a caller that tries anyway is dropped rather than silently written.
    expect(parsePostUpdate({ caption: 'hello', status: 'approved' })).toEqual({
      ok: true,
      updates: { status: 'approved' },
    })
  })
})

describe('postCopySchema', () => {
  it('accepts an edit to one column without the other', () => {
    // The calendar's caption box saves on blur with no slides in hand (schedule-card.tsx:545).
    // A required shape would force it to invent a value for the half it is not editing, and the
    // obvious invention — an empty string — blanks a caption when only the slides changed.
    expect(postCopySchema.safeParse({ caption: 'just the words' }).success).toBe(true)
    expect(postCopySchema.safeParse({ slides_json: [{ headline: 'a', body: 'b' }] }).success).toBe(
      true
    )
  })

  it('still refuses a caption that is not a string', () => {
    expect(postCopySchema.safeParse({ caption: 42 }).success).toBe(false)
  })
})

describe('parsePostUpdate', () => {
  it('writes only the keys it was given', () => {
    const result = parsePostUpdate({ status: 'approved' })
    expect(result).toEqual({ ok: true, updates: { status: 'approved' } })
  })

  it('drops keys that are not writable rather than rejecting the write', () => {
    // Matches what both call sites did: an unknown key was simply never copied into
    // the payload. Rejecting instead would break any caller sending an extra field.
    const result = parsePostUpdate({ status: 'approved', agency_id: 'someone-elses' })
    expect(result).toEqual({ ok: true, updates: { status: 'approved' } })
  })

  it('skips an explicit undefined instead of writing null', () => {
    // Callers spread conditionals into these objects — `...(at ? { scheduled_at: at } : {})`
    // — so `undefined` must mean "not touching this column", never "clear it".
    const result = parsePostUpdate({ status: 'approved', scheduled_at: undefined })
    expect(result).toEqual({ ok: true, updates: { status: 'approved' } })
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
    it('is not writable here at all — a post does not have one', () => {
      // It was, under an exact display-case check, because `posts.platform` recorded the
      // network a post was written for. A post reaches its networks through
      // `post_publications`, one row per destination, so there is no column to write.
      expect(parsePostUpdate({ platform: 'Instagram' })).toEqual({ ok: true, updates: {} })
    })
  })

  describe('quality_score_avg', () => {
    it('is not writable here at all — persistRewrite owns it', () => {
      // It WAS writable here, with no caller sending it. The "null means nobody judged this"
      // rule that used to be asserted on this line still holds; it is persistRewriteSchema's
      // rule now (post-actions.ts), because that is the one thing that writes the column.
      expect(parsePostUpdate({ quality_score_avg: null })).toEqual({ ok: true, updates: {} })
      expect(parsePostUpdate({ quality_score_avg: 8 })).toEqual({ ok: true, updates: {} })
    })
  })

  it('rejects a body that is not an object', () => {
    expect(parsePostUpdate('caption=hi')).toEqual({ ok: false, error: 'Invalid request body' })
  })
})
