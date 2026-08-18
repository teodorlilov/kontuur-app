import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ResearchPromptBuilder } from '../prompts/prompt-builder'
import type { LanguageConfig } from '@/lib/clients/language-rules'
import type { SourceContext } from '../types'

/**
 * Byte-equality guard for the batch research prompt.
 *
 * The prompt is about to be restructured — the five source sections extract into a
 * private block builder, and a briefs section is added — so the batch path needs a
 * guarantee stronger than "the assertions still pass". Every other test in this
 * directory uses `toContain`, which cannot catch a reordered section, a dropped
 * blank line, or a changed separator.
 *
 * If this fails, the batch prompt changed. That is either a bug or a deliberate
 * decision that wants its own commit — never an incidental edit. Prompt-cache
 * prefixes and model behaviour both key off the exact bytes.
 */

const LANGUAGE_CONFIG: LanguageConfig = {
  language: 'English',
  formality: 'neutral',
  carouselSwipeCues: '',
  formalityRules: null,
  languageInstructions: 'Write in plain English.',
  languageNotes: 'Avoid jargon.',
}

const CONTEXT: SourceContext = {
  rssItems: [
    {
      title: 'Runners are skipping warm-ups',
      description: 'A study of 400 amateur runners.',
      link: 'https://example.com/warmups',
      pubDate: '2026-08-01',
      eligiblePillars: ['Education'],
    },
  ],
  websiteExcerpts: [
    { url: 'https://acme.test/services', text: 'Our 12-week knee rehab programme.' },
  ],
  fileExcerpts: [{ label: 'services-2026.pdf', text: 'Pricing and treatment list.' }],
  webSearchItems: [
    {
      title: 'New guidance on ACL recovery',
      snippet: 'Timelines vary more than expected.',
      url: 'https://example.com/acl',
      score: 0.72,
    },
  ],
  performanceItems: [
    {
      caption: 'Our most-saved post',
      engagementSummary: '210 likes, 40 saves',
      pillar: 'Education',
    },
  ],
}

function builder() {
  return new ResearchPromptBuilder({
    niche: 'physiotherapy',
    languageConfig: LANGUAGE_CONFIG,
    contentPillars: [
      { id: 'p1', pillar: 'Education', weight: 60 },
      { id: 'p2', pillar: 'Promotion', weight: 40 },
    ],
    postHistory: ['A post about shin splints'],
    excludedUrls: ['https://example.com/already-used'],
    recentPillarCounts: new Map([['Education', 2]]),
  })
}

// The prompt opens with `Date: <today>`, so an unpinned clock would make these
// snapshots pass on the day they were written and fail every day after.
beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-15T09:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

describe('batch research prompt', () => {
  it('is byte-for-byte stable across the gather/plan refactor', () => {
    expect(
      builder().buildTopicPlanPrompt({ briefs: [], researchCount: 3 }, CONTEXT)
    ).toMatchSnapshot()
  })

  it('is byte-for-byte stable with no source context', () => {
    expect(builder().buildTopicPlanPrompt({ briefs: [], researchCount: 3 })).toMatchSnapshot()
  })

  it('is identical for the same inputs called twice', () => {
    // Guards against a section that interpolates something non-deterministic — a
    // date, a shuffle, a Set iteration order — which would silently break prompt
    // caching without changing any assertion above.
    expect(builder().buildTopicPlanPrompt({ briefs: [], researchCount: 3 }, CONTEXT)).toBe(
      builder().buildTopicPlanPrompt({ briefs: [], researchCount: 3 }, CONTEXT)
    )
  })
})
