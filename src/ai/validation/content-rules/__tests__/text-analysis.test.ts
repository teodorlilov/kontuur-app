import { describe, it, expect } from 'vitest'
import { analyzeSentenceVariety, countWords, countHashtags } from '../text-analysis'

describe('analyzeSentenceVariety', () => {
  it('detects short and long sentences', () => {
    const text = 'Short. This is a much longer sentence that has more than twenty words in it to satisfy the long sentence requirement easily.'
    const result = analyzeSentenceVariety(text)
    expect(result.hasShortSentence).toBe(true)
    expect(result.hasLongSentence).toBe(true)
    expect(result.passes).toBe(true)
  })

  it('fails when no short sentence', () => {
    const text = 'This sentence has seven words total. This one also has seven words. Another sentence with seven words here.'
    const result = analyzeSentenceVariety(text)
    expect(result.hasShortSentence).toBe(false)
    expect(result.passes).toBe(false)
  })

  it('fails when no long sentence', () => {
    const text = 'Short. Also short. Very brief.'
    const result = analyzeSentenceVariety(text)
    expect(result.hasLongSentence).toBe(false)
    expect(result.passes).toBe(false)
  })

  it('detects consecutive similar-length sentences', () => {
    // Three sentences of similar length (within 3 words)
    const text = 'I like running in the park. She enjoys swimming at the beach. He prefers biking on the road. This is completely different and much much longer than the others so variety is achieved.'
    const result = analyzeSentenceVariety(text)
    expect(result.maxConsecutiveSimilar).toBe(3)
    expect(result.passes).toBe(false) // max consecutive > 2
  })

  it('returns failing result for empty text', () => {
    const result = analyzeSentenceVariety('')
    expect(result.hasShortSentence).toBe(false)
    expect(result.hasLongSentence).toBe(false)
    expect(result.passes).toBe(false)
  })

  it('handles single sentence', () => {
    const result = analyzeSentenceVariety('Just one sentence.')
    expect(result.maxConsecutiveSimilar).toBe(1)
  })
})

describe('countWords', () => {
  it('counts words correctly', () => {
    expect(countWords('hello world')).toBe(2)
    expect(countWords('one two three four five')).toBe(5)
  })

  it('returns 0 for empty text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })

  it('handles extra whitespace', () => {
    expect(countWords('  hello   world  ')).toBe(2)
  })
})

describe('countHashtags', () => {
  it('counts hashtags at start of word', () => {
    expect(countHashtags('#hello #world')).toBe(2)
  })

  it('counts mid-sentence hashtags', () => {
    expect(countHashtags('Check out #trending topic with #viral content')).toBe(2)
  })

  it('returns 0 when no hashtags', () => {
    expect(countHashtags('no hashtags here')).toBe(0)
  })

  it('handles hashtags at end of text', () => {
    expect(countHashtags('Post text #tag1 #tag2 #tag3')).toBe(3)
  })
})

