import { describe, it, expect } from 'vitest'
import { generateStreamSchema, priorityPostSchema } from '../schemas'

/**
 * These pin the wire contract that keeps posts.platform canonical: the enum in
 * priorityPostSchema is the only thing standing between a hand-made request and
 * the display-case CHECK on the column (20260809).
 */
describe('priorityPostSchema', () => {
  const brief = { title: 'Autumn offer' }

  it("defaults platform to '' — inherit the run platform", () => {
    const parsed = priorityPostSchema.parse(brief)
    expect(parsed.platform).toBe('')
    expect(parsed.brief).toBe('')
    expect(parsed.targetDate).toBe('')
  })

  it("keeps '' and accepts canonical platform names", () => {
    expect(priorityPostSchema.parse({ ...brief, platform: '' }).platform).toBe('')
    expect(priorityPostSchema.parse({ ...brief, platform: 'Instagram' }).platform).toBe('Instagram')
  })

  it('rejects a non-canonical spelling', () => {
    expect(priorityPostSchema.safeParse({ ...brief, platform: 'instagram' }).success).toBe(false)
    expect(priorityPostSchema.safeParse({ ...brief, platform: 'Threads' }).success).toBe(false)
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
    platform: 'Instagram',
    postType: 'single',
    targetPostCount: 2,
    preloadedClientData: clientData,
  }

  it('accepts briefs of the real shape and applies their defaults', () => {
    const parsed = generateStreamSchema.parse({
      ...body,
      priorityPosts: [{ title: 'The idea', brief: 'notes', platform: 'Facebook' }],
    })
    expect(parsed.priorityPosts?.[0]?.platform).toBe('Facebook')
    expect(parsed.priorityPosts?.[0]?.targetDate).toBe('')
  })

  it('rejects a brief with a bad platform, and a bad run platform', () => {
    expect(
      generateStreamSchema.safeParse({
        ...body,
        priorityPosts: [{ title: 'x', platform: 'instagram' }],
      }).success
    ).toBe(false)
    expect(generateStreamSchema.safeParse({ ...body, platform: 'instagram' }).success).toBe(false)
  })
})
