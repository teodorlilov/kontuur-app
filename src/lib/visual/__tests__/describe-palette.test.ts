import { describe, it, expect, vi, beforeEach } from 'vitest'
import { describePalette } from '../describe-palette'
import { DEFAULT_PALETTE } from '../identity'
import { callAnthropic, mockClaudeToolResponse } from '@/utils/__mocks__/ai-client'

vi.mock('@/utils/ai-client')

beforeEach(() => {
  vi.mocked(callAnthropic).mockReset()
})

describe('describePalette', () => {
  it('assembles the labelled block from the Haiku colour names', async () => {
    mockClaudeToolResponse({
      surface: 'white',
      ink: 'near-black',
      accent: 'medium periwinkle blue',
      accent_deep: 'deep indigo blue',
      line: 'light gray',
      character: 'Cool, clean, modern, predominantly monochromatic blue.',
    })
    const block = await describePalette(DEFAULT_PALETTE)
    expect(block).toBe(
      'Dominant background: white\n' +
        'Ink: near-black\n' +
        'Primary accent: medium periwinkle blue\n' +
        'Deep accent: deep indigo blue\n' +
        'Neutral line: light gray\n' +
        'Palette character: Cool, clean, modern, predominantly monochromatic blue.'
    )
  })

  it('samples at zero so two concurrent generations name the same hex the same way', async () => {
    mockClaudeToolResponse({
      surface: 'white',
      ink: 'near-black',
      accent: 'warm sand',
      accent_deep: 'soft warm gray',
      line: 'light gray',
      character: 'Warm, quiet, editorial.',
    })
    await describePalette(DEFAULT_PALETTE)
    expect(vi.mocked(callAnthropic).mock.calls[0]?.[0]).toMatchObject({ temperature: 0 })
  })

  it('falls back to labelled hex lines when the Haiku call fails', async () => {
    vi.mocked(callAnthropic).mockRejectedValue(new Error('api down'))
    const block = await describePalette(DEFAULT_PALETTE)
    expect(block).toContain('Dominant background: #FFFFFF')
    expect(block).toContain('Primary accent: #2563EB')
    expect(block).not.toContain('Palette character')
  })
})
