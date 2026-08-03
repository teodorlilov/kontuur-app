import { describe, it, expect } from 'vitest'
import { buildClientBrief, buildClientProfile } from '../build-prompt-sections'
import type { ClientData } from '@/lib/clients/fetch-client-data'

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
    const brief = buildClientBrief(makeClient({ socialGoals: 'Book an appointment' }), 'Instagram')
    expect(brief).toContain('Goal: Book an appointment')
  })

  it('carries the goal into the validation profile', () => {
    const profile = buildClientProfile(
      makeClient({ socialGoals: 'Book an appointment' }),
      'Instagram'
    )
    expect(profile).toContain('Post goal: Book an appointment')
  })

  it('emits no line at all when no goal is set', () => {
    expect(buildClientBrief(makeClient(), 'Instagram')).not.toContain('Goal:')
    expect(buildClientProfile(makeClient(), 'Instagram')).not.toContain('Post goal:')
  })

  it('leaves the rest of the prompt byte-identical when no goal is set', () => {
    // The guarantee that matters for the cached prefix: adding the field changed nothing for the
    // clients who never answered the question.
    const withoutGoal = makeClient()
    const withGoal = makeClient({ socialGoals: 'Book an appointment' })

    expect(buildClientProfile(withGoal, 'Instagram').replace('\nPost goal: Book an appointment', ''))
      .toBe(buildClientProfile(withoutGoal, 'Instagram'))
  })
})
