import { describe, it, expect } from 'vitest'
import {
  buildClientBrief,
  buildClientProfile,
  buildQualityBar,
  buildNativeWritingRules,
} from '../build-prompt-sections'
import { LANGUAGE_STANDARDS } from '../language-standards'
import { buildLanguageValidationRules } from '@/ai/validation/prompts/language-validation-rules'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { LanguageConfig } from '@/lib/clients/language-rules'

function makeClient(overrides: Partial<ClientData> = {}): ClientData {
  return {
    id: 'client-1',
    name: 'Acme Clinic',
    niche: 'physiotherapy',
    targetAudience: 'active adults 30-50',
    tone: 'warm',
    avoidTopics: '',
    socialGoals: '',
    isHealthNiche: false,
    contentPillars: [{ id: 'p1', pillar: 'Educational', weight: 100 }],
    postHistory: [],
    languageConfig: {
      language: 'English',
      formality: 'neutral',
      carouselSwipeCues: '',
      formalityRules: null,
      languageInstructions: '',
      languageNotes: '',
    },
    ...overrides,
    // Only prompt-relevant fields populated; cast documents the gap
  } as unknown as ClientData
}

// The post goal reaches the model or the question the onboarding sheet forces the user to answer
// is decoration. Both builders sit in a cached prompt prefix, so the line must be absent — not
// empty — when no goal is set, or every existing client's prefix changes for nothing.
describe('post goal in the prompts', () => {
  it('carries the goal into the generation brief', () => {
    const brief = buildClientBrief(makeClient({ socialGoals: 'Book an appointment' }))
    expect(brief).toContain('Goal: Book an appointment')
  })

  it('carries the goal into the validation profile', () => {
    const profile = buildClientProfile(makeClient({ socialGoals: 'Book an appointment' }))
    expect(profile).toContain('Post goal: Book an appointment')
  })

  it('emits no line at all when no goal is set', () => {
    expect(buildClientBrief(makeClient())).not.toContain('Goal:')
    expect(buildClientProfile(makeClient())).not.toContain('Post goal:')
  })

  it('leaves the rest of the prompt byte-identical when no goal is set', () => {
    // The guarantee that matters for the cached prefix: adding the field changed nothing for the
    // clients who never answered the question.
    const withoutGoal = makeClient()
    const withGoal = makeClient({ socialGoals: 'Book an appointment' })

    expect(buildClientProfile(withGoal).replace('\nPost goal: Book an appointment', '')).toBe(
      buildClientProfile(withoutGoal)
    )
  })
})

// Carousel instructions in a single-post prompt taught the writer to emit slide
// structure as caption text — the quality bar must speak only its own format.
describe('buildQualityBar format awareness', () => {
  it('the single bar never mentions slides or carousels', () => {
    expect(buildQualityBar('single').toLowerCase()).not.toMatch(/slide|carousel/)
  })

  it('the carousel bar keeps the last-slide CTA rule', () => {
    expect(buildQualityBar('carousel')).toContain("LAST slide's BODY")
    expect(buildQualityBar('carousel')).toContain('cover headline')
  })

  it('both formats carry the shared failure modes', () => {
    expect(buildQualityBar('single')).toContain('weak hook')
    expect(buildQualityBar('carousel')).toContain('weak hook')
  })
})

describe('buildNativeWritingRules', () => {
  const config = (language: string): LanguageConfig =>
    ({
      language,
      formality: 'neutral',
      carouselSwipeCues: '',
      formalityRules: null,
      languageInstructions: '',
      languageNotes: '',
    }) as LanguageConfig

  it('tells a non-English writer to re-express, not translate', () => {
    const rules = buildNativeWritingRules(config('Bulgarian'))
    expect(rules).toContain('WRITE NATIVE BULGARIAN')
    expect(rules).toContain('Never translate English phrasing word-for-word')
  })

  it('is empty for English clients — every rule is about crossing FROM English', () => {
    expect(buildNativeWritingRules(config('English'))).toBe('')
    expect(buildNativeWritingRules(config('english '))).toBe('')
  })

  // The writer must be told everything the judge grades. These two pins hold the
  // writer prompt and the judge checklist to the same LANGUAGE_STANDARDS table —
  // the drift they prevent is exactly how posts full of anglicisms shipped while
  // the judge "knew" better.
  it('renders every standard the judge checks', () => {
    const writer = buildNativeWritingRules(config('Bulgarian'))
    for (const standard of LANGUAGE_STANDARDS) {
      expect(writer).toContain(standard.write('Bulgarian'))
    }
  })

  it('the judge checklist renders the same standards', () => {
    const judge = buildLanguageValidationRules(config('Bulgarian'))
    for (const standard of LANGUAGE_STANDARDS) {
      expect(judge).toContain(standard.check)
    }
  })
})
