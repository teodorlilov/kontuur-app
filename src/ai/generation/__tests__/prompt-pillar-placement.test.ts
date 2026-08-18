import { describe, it, expect } from 'vitest'
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  VOICE_SECTION_MARKER,
  LEARNED_SECTION_MARKER,
} from '../prompts/prompt-builder'
import type { ClientData } from '@/lib/clients/fetch-client-data'
import type { SinglePostInput } from '../types'

/** The system prompt's instruction half — everything before the first
 *  client-derived section (approved captions / distilled memo rules), which
 *  is verbatim client-derived text and carries no wording invariants. */
function instructionSections(system: string): string {
  return system.split(VOICE_SECTION_MARKER)[0]!.split(LEARNED_SECTION_MARKER)[0]!
}

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
    const system = buildGenerateSystemPrompt(makeClient(), 'Instagram', 'single')
    expect(system).not.toContain('This post targets pillar')
  })

  it('system prompt is identical across themes with different pillars', () => {
    // The pillar is a per-theme input — the system prompt must not vary with it
    const a = buildGenerateSystemPrompt(makeClient(), 'Instagram', 'single')
    const b = buildGenerateSystemPrompt(makeClient(), 'Instagram', 'single')
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

// The old format-neutral system prompt put carousel instructions in front of the
// single-post writer, which sometimes obeyed them — a whole carousel written out
// as one caption. The single prompt's INSTRUCTIONS must not speak carousel;
// exemplar text after the VOICE marker is client copy and may say anything.
describe('format separation', () => {
  it('the single instruction sections never mention slides or carousels', () => {
    const system = buildGenerateSystemPrompt(makeClient(), 'Instagram', 'single')
    expect(instructionSections(system).toLowerCase()).not.toMatch(/slide|carousel/)
  })

  it('the carousel system prompt carries the last-slide CTA rule', () => {
    const system = buildGenerateSystemPrompt(makeClient(), 'Instagram', 'carousel')
    expect(system).toContain("LAST slide's BODY")
  })

  it('the single user prompt states the plain-text contract', () => {
    const user = buildGenerateUserPrompt(makeInput())
    expect(user).toContain('no markdown syntax')
    expect(user).not.toContain('Separate multiple posts')
  })
})

describe('voice exemplars', () => {
  function clientWithExemplars(): ClientData {
    return {
      ...makeClient(),
      exemplars: {
        single: [
          'An approved caption mentioning our carousel of new arrivals — come see it in store.',
        ],
        carousel: [{ caption: 'Approved carousel caption.', coverHeadline: 'Five tips' }],
      },
    } as ClientData
  }

  it('client copy may say "carousel" without breaking the instruction invariant', () => {
    const system = buildGenerateSystemPrompt(clientWithExemplars(), 'Instagram', 'single')
    expect(system).toContain('carousel of new arrivals')
    expect(instructionSections(system).toLowerCase()).not.toMatch(/slide|carousel/)
  })

  it('each format sees only its own exemplars', () => {
    const single = buildGenerateSystemPrompt(clientWithExemplars(), 'Instagram', 'single')
    const carousel = buildGenerateSystemPrompt(clientWithExemplars(), 'Instagram', 'carousel')
    expect(single).toContain('new arrivals')
    expect(single).not.toContain('Five tips')
    expect(carousel).toContain('Five tips')
    expect(carousel).not.toContain('new arrivals')
  })

  it('no approved posts → no VOICE section at all', () => {
    const system = buildGenerateSystemPrompt(makeClient(), 'Instagram', 'single')
    expect(system).not.toContain(VOICE_SECTION_MARKER)
  })

  // The cache contract: exemplars are per-client data fetched once per run, so
  // two builds must be byte-identical — a run-varying exemplar set would
  // silently fork the cached prefix on every theme.
  it('system prompt with exemplars is run-invariant', () => {
    const a = buildGenerateSystemPrompt(clientWithExemplars(), 'Instagram', 'single')
    const b = buildGenerateSystemPrompt(clientWithExemplars(), 'Instagram', 'single')
    expect(a).toBe(b)
  })
})
