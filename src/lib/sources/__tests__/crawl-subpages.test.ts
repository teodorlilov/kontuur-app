import { describe, it, expect } from 'vitest'
import { extractLinks } from '../crawl-subpages'

describe('extractLinks', () => {
  const base = 'https://example.com/listings/'

  it('extracts markdown links', () => {
    const md = '[Property A](https://example.com/property/a) and [Property B](https://example.com/property/b)'
    expect(extractLinks(md, base)).toEqual([
      'https://example.com/property/a',
      'https://example.com/property/b',
    ])
  })

  it('resolves relative URLs against base', () => {
    const md = '[Item](/property/cool-house)'
    expect(extractLinks(md, base)).toEqual(['https://example.com/property/cool-house'])
  })

  it('filters out external links', () => {
    const md = '[External](https://other-site.com/about) [Internal](https://example.com/about)'
    expect(extractLinks(md, base)).toEqual(['https://example.com/about'])
  })

  it('excludes navigation paths', () => {
    const md = `
[Page 2](/page/2)
[Tag](/tag/luxury)
[Category](/category/apartments)
[Search](/search?q=test)
[Login](/login)
[Property](/property/nice-flat)
`
    expect(extractLinks(md, base)).toEqual(['https://example.com/property/nice-flat'])
  })

  it('deduplicates URLs', () => {
    const md = '[A](/property/a) and [A again](/property/a)'
    expect(extractLinks(md, base)).toEqual(['https://example.com/property/a'])
  })

  it('skips anchors, mailto, and tel links', () => {
    const md = '[Top](#top) [Email](mailto:test@x.com) [Phone](tel:123) [Real](/property/x)'
    expect(extractLinks(md, base)).toEqual(['https://example.com/property/x'])
  })

  it('strips hash and query for dedup', () => {
    const md = '[A](/property/a#details) [B](/property/a?ref=123)'
    expect(extractLinks(md, base)).toEqual(['https://example.com/property/a'])
  })

  it('skips the source page itself', () => {
    const md = '[Self](/listings/) [Other](/property/a)'
    expect(extractLinks(md, base)).toEqual(['https://example.com/property/a'])
  })

  it('returns empty for markdown with no links', () => {
    expect(extractLinks('Just some text', base)).toEqual([])
  })
})
