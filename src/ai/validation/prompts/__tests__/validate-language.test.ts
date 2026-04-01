import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/ai/client')

import { mockClaudeResponse } from '@/ai/__mocks__/client'
import { validateLanguage } from '../validate-language'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateLanguage', () => {
  it('returns passing result for clean text', async () => {
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    const result = await validateLanguage({ text: 'Чудесен ден за разходка.' }, 'Bulgarian', 'casual')
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
    const result = await validateLanguage({ text: 'Следвайте новите тренд и направете разлика.' }, 'Bulgarian', 'neutral')
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
    await validateLanguage({ text: 'Test text' }, 'Spanish', 'formal')

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).toContain('Spanish')
    expect(prompt).toContain('formal')
  })

  it('handles JSON in markdown code block', async () => {
    mockClaudeResponse('```json\n{"issues":[],"corrected_text":null}\n```')
    const result = await validateLanguage({ text: 'Text' }, 'English', 'casual')
    expect(result.passes).toBe(true)
    expect(result.language_score).toBe(10)
  })

  it('includes banned lists in the system prompt when provided', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage({ text: 'Test text' }, 'Bulgarian', 'formal', ['свайпни', 'лайкни'], ['Открийте силата на'])

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const systemText = (callArgs.system as Array<{ text: string }>)[0]!.text
    expect(systemText).toContain('свайпни')
    expect(systemText).toContain('лайкни')
    expect(systemText).toContain('Открийте силата на')
  })

  it('includes Bulgarian-specific validation rules for Bulgarian language', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage({ text: 'Test text' }, 'Bulgarian', 'formal')

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const systemText = (callArgs.system as Array<{ text: string }>)[0]!.text
    expect(systemText).toContain('BULGARIAN-SPECIFIC CHECKS')
    expect(systemText).toContain('вместо Вас')
    expect(systemText).toContain('sounds translated from English')
  })

  it('does not include Bulgarian rules for non-Bulgarian languages', async () => {
    const { anthropic } = await import('@/ai/__mocks__/client')
    mockClaudeResponse(JSON.stringify({
      issues: [],
      corrected_text: null,
    }))
    await validateLanguage({ text: 'Test text' }, 'English', 'casual')

    const callArgs = anthropic.messages.create.mock.calls[0]![0]
    const prompt = callArgs.messages[0]!.content as string
    expect(prompt).not.toContain('BULGARIAN-SPECIFIC CHECKS')
  })
})
