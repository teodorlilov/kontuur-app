import { describe, expect, it } from 'vitest'
import { toTheme, toThemeTitle } from '../to-theme'
import type { ResearchTopic } from '@/ai/research/types'

describe('toTheme', () => {
  it('carries every source field a draft needs for attribution', () => {
    const topic: ResearchTopic = {
      finding: 'why this theme',
      suggested_theme: 'Inside our 12-week knee rehab programme',
      pillar: 'Education',
      source_url: 'https://acme.test/knee-rehab',
      source_title: 'Knee rehab',
      source_type: 'website',
      source_excerpt: 'a 12-week programme',
      source_full_text: 'the whole page',
      client_source_id: 'src-9',
    }

    expect(toTheme(topic)).toEqual({
      description: 'Inside our 12-week knee rehab programme',
      count: 1,
      pillar: 'Education',
      sourceUrl: 'https://acme.test/knee-rehab',
      sourceTitle: 'Knee rehab',
      sourceType: 'website',
      sourceExcerpt: 'a 12-week programme',
      sourceFullText: 'the whole page',
      clientSourceId: 'src-9',
    })
  })

  it('never sets platform — research and cron themes inherit the run platform', () => {
    // Only a priority brief may carry a per-theme platform. If toTheme ever set
    // one, every cron theme would stop falling back to extractPlatformFromMix.
    const theme = toTheme({ finding: 'f', suggested_theme: 'a theme' })
    expect('platform' in theme).toBe(false)
  })

  it('normalises absent pillar and source_type to undefined, and source id to null', () => {
    // The two call sites this replaced disagreed here: one coalesced `pillar` and
    // the other passed it through, so an unpillared topic reached generation as
    // `null` on one path and `undefined` on the other.
    const topic: ResearchTopic = {
      finding: 'f',
      suggested_theme: 'A brief-derived theme',
      source_url: null,
      source_title: null,
      source_type: null,
    }

    const theme = toTheme(topic)

    expect(theme.pillar).toBeUndefined()
    expect(theme.sourceType).toBeUndefined()
    expect(theme.clientSourceId).toBeNull()
    expect(theme.count).toBe(1)
  })
})

describe('toThemeTitle', () => {
  it('leaves a short brief alone', () => {
    expect(toThemeTitle('Post about our new knee programme')).toBe(
      'Post about our new knee programme'
    )
  })

  it('breaks on a word boundary rather than mid-word', () => {
    const text =
      'Can we cover the new European packaging regulations before they come into force next spring'

    const title = toThemeTitle(text)
    const kept = title.slice(0, -1) // drop the ellipsis

    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(61) // 60 + the ellipsis
    expect(text.startsWith(kept)).toBe(true)
    // The real guarantee: the cut lands where a word ends, so the next character in
    // the original is a space. `slice(0, 60)` cut inside "regulations" here.
    expect(text[kept.length]).toBe(' ')
    expect(title).toBe('Can we cover the new European packaging regulations before…')
  })

  it('collapses the whitespace a client typed', () => {
    expect(toThemeTitle('  our   new\n\nprogramme  ')).toBe('our new programme')
  })

  it('hard-cuts a single word with no boundary to break on', () => {
    const title = toThemeTitle('a'.repeat(80))

    expect(title).toBe('a'.repeat(60) + '…')
  })
})
