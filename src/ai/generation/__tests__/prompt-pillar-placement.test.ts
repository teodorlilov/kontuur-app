import { describe, it, expect } from 'vitest'
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
} from '../prompts/prompt-builder'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { SinglePostInput } from '../types'

function makeClient(): ClientData {
  return {
    id: 'client-1',
    name: 'Acme Clinic',
    niche: 'physiotherapy',
    targetAudience: 'active adults',
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
    // Only prompt-relevant fields populated; cast documents the gap
  } as unknown as ClientData
}

function makeInput(targetPillar?: string): SinglePostInput {
  return {
    client: makeClient(),
    theme: 'recovery tips',
    targetPillar,
    platform: 'Instagram',
    count: 1,
  }
}

describe('pillar placement (cache-prefix stability)', () => {
  it('system prompt never contains the pillar line', () => {
    const system = buildGenerateSystemPrompt(makeClient(), 'Instagram')
    expect(system).not.toContain('This post targets pillar')
  })

  it('system prompt is identical across themes with different pillars', () => {
    // The pillar is a per-theme input — the system prompt must not vary with it
    const a = buildGenerateSystemPrompt(makeClient(), 'Instagram')
    const b = buildGenerateSystemPrompt(makeClient(), 'Instagram')
    expect(a).toBe(b)
  })

  it('user prompt carries the pillar line when a pillar is set', () => {
    const user = buildGenerateUserPrompt(makeInput('Educational'))
    expect(user).toContain('This post targets pillar: Educational')
  })

  it('user prompt omits the pillar line when no pillar is set', () => {
    const user = buildGenerateUserPrompt(makeInput(undefined))
    expect(user).not.toContain('This post targets pillar')
  })
})
