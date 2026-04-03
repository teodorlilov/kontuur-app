import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/ai/client')

import { mockClaudeResponse } from '@/ai/__mocks__/client'
import { validateLanguage } from '../validate-language'
import type { LanguageConfig } from '@/lib/clients/language-rules'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeLanguageConfig(overrides: Partial<LanguageConfig> = {}): LanguageConfig {
  return {
    language: 'Bulgarian',
    formality: 'neutral',
    nativeCTAPhrases: '',
    carouselSwipeCues: '',
    formalityRules: null,
    languageInstructions: '',
    openerExamples: [],
    languageNotes: '',
    ...overrides,
  }
}

describe('validateLanguage', () => {
  it('returns passing result for clean text', async () => {
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    const result = await validateLanguage(
      { text: 'Чудесен ден за разходка.' },
      makeLanguageConfig({ formality: 'casual' }),
    )
    expect(result.passes).toBe(true)
    expect(result.language_score).toBe(10)
    expect(result.issues).toEqual([])
    expect(result.corrected_text).toBeNull()
  })

  it('returns issues with corrections', async () => {
    mockClaudeResponse(JSON.stringify({
      issues: [
        {
          type: 'anglicism',
          original_text: 'тренд',
          issue_description: 'English loanword used unnecessarily',
          suggested_fix: 'тенденция',
        },
        {
          type: 'calque',
          original_text: 'направи разлика',
          issue_description: 'Calque from "make a difference"',
          suggested_fix: 'повлияй',
        },
      ],
      corrected_text: 'Следвайте новите тенденции и повлияйте на живота си.',
    }))
    const result = await validateLanguage(
      { text: 'Следвайте новите тренд и направете разлика.' },
      makeLanguageConfig(),
    )
    expect(result.passes).toBe(false)
    // anglicism (1.0) + calque (1.5) = 2.5 penalty → score = round(10 - 2.5) = 8
    expect(result.language_score).toBe(8)
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0]!.type).toBe('anglicism')
    expect(result.issues[1]!.type).toBe('calque')
    expect(result.corrected_text).toContain('тенденции')
  })

  it('includes language and formality in the prompt', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage(
      { text: 'Test text' },
      makeLanguageConfig({ language: 'Spanish', formality: 'formal' }),
    )

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Spanish')
    expect(prompt).toContain('formal')
  })

  it('handles JSON in markdown code block', async () => {
    mockClaudeResponse('```json\n{"issues":[],"corrected_text":null}\n```')
    const result = await validateLanguage(
      { text: 'Text' },
      makeLanguageConfig({ language: 'English', formality: 'casual' }),
    )
    expect(result.passes).toBe(true)
    expect(result.language_score).toBe(10)
  })

  it('includes language instructions in the system prompt when provided', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage(
      { text: 'Test text' },
      makeLanguageConfig({
        languageInstructions: 'Avoid English loanwords. Use native Bulgarian equivalents.',
      }),
    )

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const systemText = (callArgs.system as Array<{ text: string }>)[0]!.text
    expect(systemText).toContain('Avoid English loanwords')
    expect(systemText).toContain('native Bulgarian equivalents')
  })

  it('includes language-specific checks when languageInstructions provided', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage(
      { text: 'Test text' },
      makeLanguageConfig({
        languageInstructions: 'BULGARIAN-SPECIFIC: Check that sounds translated from English are flagged.',
      }),
    )

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const systemText = (callArgs.system as Array<{ text: string }>)[0]!.text
    expect(systemText).toContain('Bulgarian-SPECIFIC CHECKS')
    expect(systemText).toContain('sounds translated from English')
  })

  it('includes client language notes in the system prompt', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage(
      { text: 'Test text' },
      makeLanguageConfig({
        languageNotes: 'Always use програма not план',
      }),
    )

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const systemText = (callArgs.system as Array<{ text: string }>)[0]!.text
    expect(systemText).toContain('Always use програма not план')
  })

  it('does not include language instructions when empty', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage(
      { text: 'Test text' },
      makeLanguageConfig({ language: 'English', languageInstructions: '' }),
    )

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const systemText = (callArgs.system as Array<{ text: string }>)[0]!.text
    expect(systemText).not.toContain('SPECIFIC CHECKS')
  })
})
