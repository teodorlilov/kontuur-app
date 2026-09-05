import { describe, expect, it } from 'vitest'
import { ANSWERABLE_FIELDS, blockingFields, countFilled, hasValue } from '../draft-payload'
import { buildEmptyDraft } from '../build-draft'
import type { DraftFieldId, DraftProfile } from '@/features/onboarding/types'

function draft(overrides: Partial<DraftProfile> = {}): DraftProfile {
  return { ...buildEmptyDraft(), name: 'Haelan', ...overrides }
}

describe('blockingFields', () => {
  it('blocks on a question the sheet raised and the user has not answered', () => {
    expect(blockingFields(draft(), ['goal', 'tone'])).toEqual(['goal', 'tone'])
  })

  it('clears each one as it is answered', () => {
    const answered = draft({ goal: 'Book a viewing' })
    expect(blockingFields(answered, ['goal', 'tone'])).toEqual(['tone'])

    const both = draft({ goal: 'Book a viewing', tone: 'warm and direct' })
    expect(blockingFields(both, ['goal', 'tone'])).toEqual([])
  })

  it('always blocks a nameless client, even when nothing was asked', () => {
    // createClient rejects this, so the button has to reflect it rather than fail on click.
    expect(blockingFields(draft({ name: '' }), [])).toEqual(['name'])
    expect(blockingFields(draft({ name: '   ' }), [])).toEqual(['name'])
  })

  it('names the missing name first, so the bar reports the most basic gap', () => {
    expect(blockingFields(draft({ name: '' }), ['goal'])).toEqual(['name', 'goal'])
  })

  it('does not block on fields nobody asked about', () => {
    // A thin `avoid` or an empty audience was drafted, not questioned — the profile stays editable.
    expect(blockingFields(draft({ avoid: '', audience: '' }), [])).toEqual([])
  })

  it('lets the blank form save as soon as it has a name', () => {
    // Manual mode raises no questions, so "save whenever you like" stays true.
    expect(blockingFields(draft(), [])).toEqual([])
  })

  it('blocks again when an answered question is emptied', () => {
    // The sheet reads "answered" off the value, so it has to survive the round trip. Storing it
    // instead left the header saying "all checked" while the bar still blocked on this field.
    const asked: readonly DraftFieldId[] = ['goal']
    expect(blockingFields(draft({ goal: 'Book a viewing' }), asked)).toEqual([])
    expect(blockingFields(draft({ goal: '' }), asked)).toEqual(['goal'])
  })
})

describe('hasValue', () => {
  it('treats defaults as present, because they are real answers', () => {
    expect(hasValue(draft(), 'schedule')).toBe(true)
    expect(hasValue(draft(), 'style')).toBe(true)
  })

  it('needs a pillar to actually be named', () => {
    expect(hasValue(draft({ pillars: [{ id: 'a', pillar: '  ', weight: 100 }] }), 'mix')).toBe(
      false
    )
    expect(hasValue(draft({ pillars: [{ id: 'a', pillar: 'Tips', weight: 100 }] }), 'mix')).toBe(
      true
    )
  })
})

describe('ANSWERABLE_FIELDS', () => {
  it('leaves out the rows that start from a default', () => {
    // The blank form's counter has to mean "you filled this", so a row the sheet answered for the
    // user cannot be in the denominator.
    expect(ANSWERABLE_FIELDS).not.toContain('schedule')
    expect(ANSWERABLE_FIELDS).not.toContain('palette')
    expect(ANSWERABLE_FIELDS).not.toContain('style')
  })

  it('opens the blank form at zero', () => {
    expect(countFilled(buildEmptyDraft(), ANSWERABLE_FIELDS)).toBe(0)
  })
})

describe('countFilled', () => {
  it('counts only the fields that hold something', () => {
    expect(countFilled(draft({ name: '', goal: '' }), ['name', 'goal'])).toBe(0)
    expect(countFilled(draft({ goal: 'Build trust' }), ['name', 'goal'])).toBe(2)
  })
})
