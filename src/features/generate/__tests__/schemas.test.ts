import { describe, it, expect } from 'vitest'
import { generateStreamSchema, priorityPostSchema } from '../schemas'

/**
 * These pin the wire contract for a brief. It used to be about keeping `posts.platform`
 * canonical — the enum here was the only thing between a hand-made request and the
 * display-case CHECK on that column. Neither the column nor the field exists: a brief
 * describes what to write, and where it goes is settled when the post is scheduled.
 */
describe('priorityPostSchema', () => {
  const brief = { title: 'Autumn offer' }

  it('defaults the optional fields to empty', () => {
    const parsed = priorityPostSchema.parse(brief)
    expect(parsed.brief).toBe('')
    expect(parsed.targetDate).toBe('')
  })

  it('drops a platform rather than accepting one', () => {
    const parsed = priorityPostSchema.parse({ ...brief, platform: 'Instagram' })
    expect(parsed).not.toHaveProperty('platform')
  })

  it('requires a title', () => {
    expect(priorityPostSchema.safeParse({ title: '   ' }).success).toBe(false)
  })
})

describe('generateStreamSchema', () => {
  const clientData = {
    id: 'client-1',
    name: 'Acme',
    niche: 'physio',
    language: 'English',
    tone: 'warm',
    targetAudience: 'adults',
    avoidTopics: '',
    socialGoals: '',
    contentPillars: [],
    isHealthNiche: null,
    defaultCarouselSlides: 6,
    defaultPostType: null,
    languageNotes: '',
    languageConfig: {
      language: 'English',
      formality: 'neutral',
      carouselSwipeCues: '',
      languageInstructions: '',
      languageNotes: '',
      formalityRules: null,
    },
    postHistory: [],
  }
  const body = {
    clientId: 'client-1',
    postType: 'single',
    targetPostCount: 2,
    preloadedClientData: clientData,
  }

  it('accepts briefs of the real shape and applies their defaults', () => {
    const parsed = generateStreamSchema.parse({
      ...body,
      priorityPosts: [{ title: 'The idea', brief: 'notes' }],
    })
    expect(parsed.priorityPosts?.[0]?.brief).toBe('notes')
    expect(parsed.priorityPosts?.[0]?.targetDate).toBe('')
  })

  it('takes no run platform — a run is not aimed at a network', () => {
    const parsed = generateStreamSchema.parse({ ...body, platform: 'Instagram' })
    expect(parsed).not.toHaveProperty('platform')
  })
})
