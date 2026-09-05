import { describe, it, expect } from 'vitest'
import { ideaBriefSchema, submitIdeasSchema, submitIdeasErrorMessage } from '../schemas'

const token = 'yA3Kk9xQ1pLm2nRt4bVc5w'
const brief = { ideaText: 'Post about the new packaging rules' }

/**
 * These pin the public form's contract. It is the one unauthenticated write in the
 * app, and the two decisions below are the ones a later change is most likely to undo
 * by accident.
 */
describe('ideaBriefSchema', () => {
  it("treats '' as not-chosen for the optional fields", () => {
    // The form ships every field on every brief, empty until typed, so an empty string
    // has to parse — otherwise the submit fails for anyone who skipped a field, which
    // is the default path.
    const parsed = ideaBriefSchema.safeParse({ ...brief, targetDate: '' })
    expect(parsed.success).toBe(true)
  })

  it('takes no platform — the client cannot choose a network here', () => {
    // The form asked for one and `client_ideas.platform` stored it, under a CHECK
    // against the display-case list (20260817). It rode into generation on the brief
    // the idea became, and briefs no longer carry a network: where a post goes is
    // decided when it is scheduled. Sent anyway, it is dropped rather than stored.
    const parsed = ideaBriefSchema.parse({ ...brief, platform: 'Instagram' })
    expect(parsed).not.toHaveProperty('platform')
  })

  it('accepts only a calendar date for targetDate', () => {
    // It reaches the writer's prompt, so a free-text value is model input.
    expect(ideaBriefSchema.safeParse({ ...brief, targetDate: '2026-08-12' }).success).toBe(true)
    expect(ideaBriefSchema.safeParse({ ...brief, targetDate: '12/08/2026' }).success).toBe(false)
    expect(ideaBriefSchema.safeParse({ ...brief, targetDate: 'next Tuesday' }).success).toBe(false)
  })

  it('requires idea text that is not just whitespace', () => {
    expect(ideaBriefSchema.safeParse({ ideaText: '   ' }).success).toBe(false)
  })

  it('bounds idea text and notes', () => {
    expect(ideaBriefSchema.safeParse({ ideaText: 'x'.repeat(2001) }).success).toBe(false)
    expect(ideaBriefSchema.safeParse({ ...brief, extraNotes: 'x'.repeat(2001) }).success).toBe(
      false
    )
  })
})

describe('submitIdeasSchema', () => {
  it('requires at least one brief and caps the batch', () => {
    expect(submitIdeasSchema.safeParse({ token, ideas: [] }).success).toBe(false)
    expect(submitIdeasSchema.safeParse({ token, ideas: [brief] }).success).toBe(true)
    expect(submitIdeasSchema.safeParse({ token, ideas: Array(11).fill(brief) }).success).toBe(false)
  })
})

describe('submitIdeasErrorMessage', () => {
  // The form shows this string verbatim to the client; every failure used to
  // collapse into the same "at least one brief" line.
  function messageFor(payload: unknown): string {
    const parsed = submitIdeasSchema.safeParse(payload)
    if (parsed.success) throw new Error('expected the payload to fail')
    return submitIdeasErrorMessage(parsed.error)
  }

  it('tells an over-the-cap submission the actual limit', () => {
    expect(messageFor({ token, ideas: Array(11).fill(brief) })).toBe(
      'You can send up to 10 ideas at once'
    )
  })

  it('tells an oversize idea its character limit', () => {
    expect(messageFor({ token, ideas: [{ ideaText: 'x'.repeat(2001) }] })).toBe(
      'An idea can be up to 2,000 characters'
    )
  })

  it('tells oversize notes their character limit', () => {
    expect(messageFor({ token, ideas: [{ ...brief, extraNotes: 'x'.repeat(2001) }] })).toBe(
      'Notes can be up to 2,000 characters'
    )
  })

  it('falls back to the missing-brief message for an empty batch', () => {
    expect(messageFor({ token, ideas: [] })).toBe('At least one idea brief is required')
  })
})
