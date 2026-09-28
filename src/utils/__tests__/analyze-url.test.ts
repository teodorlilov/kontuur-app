import { describe, expect, it, vi } from 'vitest'
import { mockClaudeResponse } from '@/utils/__mocks__/ai-client'

vi.mock('@/utils/ai-client')

import { analyzeUrl } from '../ai'

const INPUT = { websiteContent: 'We cut hair in Sofia.', instagramContent: '' }

describe('analyzeUrl', () => {
  it('reads the reply’s JSON into a profile, missing fields empty', async () => {
    mockClaudeResponse('Here you go: {"detected_niche": "Hair salon"}')
    expect(await analyzeUrl(INPUT)).toMatchObject({
      detected_niche: 'Hair salon',
      detected_niche_confidence: 'low',
    })
  })

  it('throws on a reply with no JSON object, so the site reads as not read rather than empty', async () => {
    mockClaudeResponse('Sorry, I cannot help with that.')
    await expect(analyzeUrl(INPUT)).rejects.toThrow(
      'analyzeUrl: the model replied with no JSON object'
    )
  })
})
