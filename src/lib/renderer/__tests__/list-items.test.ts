import { describe, expect, it } from 'vitest'
import { parseListItems } from '../list-items'

describe('parseListItems', () => {
  it('strips the "01  " ordinal the template authors (we render our own numerals)', () => {
    expect(parseListItems('01  Проучваме марката\n02  Събираме идеи')).toEqual([
      'Проучваме марката',
      'Събираме идеи',
    ])
  })

  it('strips "1." and "1)" ordinals from LLM copy', () => {
    expect(parseListItems('1. Research\n2) Gather\n3. Design')).toEqual(['Research', 'Gather', 'Design'])
  })

  it('strips bullets (•, -, *) followed by space', () => {
    expect(parseListItems('• First\n- Second\n* Third')).toEqual(['First', 'Second', 'Third'])
  })

  it('keeps a hyphen/asterisk that is content, not a marker', () => {
    expect(parseListItems('-5°C overnight\n2*3 grid')).toEqual(['-5°C overnight', '2*3 grid'])
  })

  it('drops blank and whitespace-only lines', () => {
    expect(parseListItems('One\n\n   \nTwo')).toEqual(['One', 'Two'])
  })

  it('returns a single item for prose (renderer then falls back to plain text)', () => {
    expect(parseListItems('A single paragraph with no line breaks.')).toEqual([
      'A single paragraph with no line breaks.',
    ])
  })

  it('returns [] for empty content', () => {
    expect(parseListItems('')).toEqual([])
  })
})
