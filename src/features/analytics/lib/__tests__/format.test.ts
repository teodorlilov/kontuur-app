import { describe, expect, it } from 'vitest'
import { splitLeadSentence } from '../format'

describe('splitLeadSentence', () => {
  it('separates the opening sentence from the rest', () => {
    const { lead, rest } = splitLeadSentence(
      'Saves grew faster than any other signal this month. Almost all of that came from carousels.'
    )
    expect(lead).toBe('Saves grew faster than any other signal this month.')
    expect(rest).toBe('Almost all of that came from carousels.')
  })

  it('does not split on decimals or thousands', () => {
    const { lead } = splitLeadSentence(
      'Engagement held at 0.34 percent across 62,372 views this period. The rest follows.'
    )
    expect(lead).toBe('Engagement held at 0.34 percent across 62,372 views this period.')
  })

  it('returns single-sentence prose whole', () => {
    const text = 'Reach grew five-fold, driven by paid placement.'
    expect(splitLeadSentence(text)).toEqual({ lead: text, rest: '' })
  })
})
